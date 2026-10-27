import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  SaveTrainingPlanDto,
  TrainingPlanResponseDto,
} from '../dto/training-plan.dto';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingPlanPhaseEntity } from '../entities/training-plan-phase.entity';
import { TrainingPlanSubjectEntity } from '../entities/training-plan-subject.entity';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { toTrainingPlanResponse } from '../mappers/training-plan.mapper';
import { assertPlanPhases } from '../policies/training-plan.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { planAuditData } from '../utils/training-audit';

const PLAN_NOT_FOUND = 'Không tìm thấy giáo án';
const SUBJECT_MISSING = 'Có môn học không tồn tại';

/**
 * Giáo án của Head Trainer: chia giai đoạn theo thứ tự, mỗi giai đoạn có số tuần và các môn kèm số buổi tối thiểu mỗi tuần; lớp tạo từ giáo án giữ bản chép riêng
 */
@Injectable()
export class TrainingPlansService {
  constructor(
    @InjectRepository(TrainingPlanEntity)
    private readonly plans: Repository<TrainingPlanEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê giáo án người gọi được xem
   *
   * - Club Manager: mọi giáo án
   * - Head Trainer: giáo án của mình
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về các giáo án kèm giai đoạn và môn, sắp theo tên
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   */
  async list(actor: Actor): Promise<TrainingPlanResponseDto[]> {
    const caller = await this.access.currentUser(actor);
    const rows = await this.plans.find({
      where: actor.roles.includes(UserRole.CLUB_MANAGER)
        ? {}
        : { headTrainerId: caller.id },
      relations: { phases: { subjects: { subject: true } } },
      order: { name: 'ASC' },
    });
    return rows.map(toTrainingPlanResponse);
  }

  /**
   * Xem một giáo án
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của giáo án
   * @returns Promise trả về giáo án kèm giai đoạn và môn
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có giáo án, hoặc Head Trainer xem giáo án của người khác
   */
  async get(actor: Actor, planId: string): Promise<TrainingPlanResponseDto> {
    const caller = await this.access.currentUser(actor);
    const plan = await this.plans.findOne({
      where: { id: planId },
      relations: { phases: { subjects: { subject: true } } },
    });
    if (
      !plan ||
      (!actor.roles.includes(UserRole.CLUB_MANAGER) &&
        plan.headTrainerId !== caller.id)
    ) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return toTrainingPlanResponse(plan);
  }

  /**
   * Tạo giáo án cho chính Head Trainer gọi
   *
   * - Khóa chia sẻ các môn dùng trong giáo án, rồi tài khoản người gọi, trong transaction; kiểm lại tài khoản còn hoạt động trước khi kiểm môn
   * - Ghi nhật ký kèm tên, mô tả và các giai đoạn
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Tên, mô tả và các giai đoạn theo thứ tự
   * @returns Promise trả về giáo án vừa tạo
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws BadRequestException Nếu có môn học không tồn tại, môn bị lặp trong một giai đoạn, hoặc tổng số tuần vượt giới hạn
   */
  async create(
    actor: Actor,
    body: SaveTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const caller = await this.access.currentUser(actor);
    const planId = await this.dataSource.transaction(async (manager) => {
      const subjectsFound = await this.lockSubjects(manager, body);
      await this.access.lockActiveUser(manager, caller.id);
      if (!subjectsFound) throw new BadRequestException(SUBJECT_MISSING);
      assertPlanPhases(body.phases);
      const plan = await manager.save(
        manager.create(TrainingPlanEntity, {
          name: body.name.trim(),
          description: body.description ?? null,
          headTrainerId: caller.id,
        }),
      );
      await this.savePhases(manager, plan.id, body);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_PLAN,
        entityId: plan.id,
        before: null,
        after: planAuditData(plan.name, plan.description, body.phases),
        feature: AuditFeature.TRAIN_PLAN,
      });
      return plan.id;
    });
    return this.get(actor, planId);
  }

  /**
   * Thay toàn bộ tên, mô tả và các giai đoạn của giáo án; lớp đã tạo từ giáo án giữ nguyên bản chép của lớp
   *
   * - Khóa chia sẻ các môn dùng trong nội dung mới trước khi khóa giáo án; kiểm môn sau khi kiểm giáo án
   * - Ghi nhật ký toàn bộ nội dung giáo án trước và sau khi thay
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của giáo án
   * @param body Tên, mô tả và các giai đoạn theo thứ tự
   * @returns Promise trả về giáo án sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có giáo án hoặc giáo án của Head Trainer khác
   * @throws BadRequestException Nếu có môn học không tồn tại, môn bị lặp trong một giai đoạn, hoặc tổng số tuần vượt giới hạn
   */
  async update(
    actor: Actor,
    planId: string,
    body: SaveTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const subjectsFound = await this.lockSubjects(manager, body);
      const plan = await this.lockedOwnPlan(
        manager,
        planId,
        caller.id,
        'for_no_key_update',
      );
      if (!subjectsFound) throw new BadRequestException(SUBJECT_MISSING);
      assertPlanPhases(body.phases);
      const oldPhases = await manager.find(TrainingPlanPhaseEntity, {
        where: { planId },
        relations: { subjects: true },
        order: { position: 'ASC' },
      });
      const before = planAuditData(plan.name, plan.description, oldPhases);
      plan.name = body.name.trim();
      plan.description = body.description ?? null;
      await manager.save(plan);
      await manager.delete(TrainingPlanPhaseEntity, { planId });
      await this.savePhases(manager, planId, body);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.TRAINING_PLAN,
        entityId: planId,
        before,
        after: planAuditData(plan.name, plan.description, body.phases),
        feature: AuditFeature.TRAIN_PLAN,
      });
    });
    return this.get(actor, planId);
  }

  /**
   * Xóa giáo án chưa có lớp nào dùng
   *
   * - Ghi nhật ký kèm tên và mô tả giáo án bị xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của giáo án
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có giáo án hoặc giáo án của Head Trainer khác
   * @throws ConflictException Nếu đã có lớp dùng giáo án
   */
  async remove(actor: Actor, planId: string): Promise<void> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockedOwnPlan(
        manager,
        planId,
        caller.id,
        'pessimistic_write',
      );
      if (await manager.existsBy(TrainingClassEntity, { planId })) {
        throw new ConflictException('Giáo án đã có lớp dùng, không xóa được');
      }
      await manager.delete(TrainingPlanEntity, { id: planId });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.TRAINING_PLAN,
        entityId: planId,
        before: { name: plan.name, description: plan.description },
        after: null,
        feature: AuditFeature.TRAIN_PLAN,
      });
    });
  }

  /**
   * Khóa giáo án của chính người gọi để sửa hoặc xóa
   *
   * - Sửa: FOR NO KEY UPDATE
   * - Xóa: FOR UPDATE
   *
   * @param manager EntityManager của transaction đang chạy
   * @param planId UUID của giáo án
   * @param callerId UUID của Head Trainer gọi
   * @param mode Mức khóa row giáo án
   * @returns Promise trả về giáo án đã khóa
   * @throws NotFoundException Nếu không có giáo án hoặc giáo án của Head Trainer khác
   */
  private async lockedOwnPlan(
    manager: EntityManager,
    planId: string,
    callerId: string,
    mode: 'for_no_key_update' | 'pessimistic_write',
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id: planId },
      lock: { mode },
    });
    if (!plan || plan.headTrainerId !== callerId) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return plan;
  }

  /**
   * Khóa chia sẻ (FOR SHARE) các môn trong các giai đoạn của giáo án theo thứ tự UUID tới hết transaction, không ném lỗi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param body Nội dung giáo án gửi lên
   * @returns Promise trả về true nếu mọi môn đều tồn tại
   */
  private async lockSubjects(
    manager: EntityManager,
    body: SaveTrainingPlanDto,
  ): Promise<boolean> {
    const ids = [
      ...new Set(
        body.phases.flatMap((phase) =>
          phase.subjects.map((item) => item.subjectId),
        ),
      ),
    ];
    const found = await manager.find(TrainingSubjectEntity, {
      select: { id: true },
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_read' },
    });
    return found.length === ids.length;
  }

  /**
   * Lưu các giai đoạn của giáo án theo thứ tự gửi lên, vị trí bắt đầu từ 1, kèm các môn và số buổi tối thiểu mỗi tuần của từng giai đoạn
   *
   * @param manager EntityManager của transaction đang chạy
   * @param planId UUID của giáo án
   * @param body Nội dung giáo án gửi lên
   * @returns Promise hoàn tất khi đã lưu
   */
  private async savePhases(
    manager: EntityManager,
    planId: string,
    body: SaveTrainingPlanDto,
  ): Promise<void> {
    const phases = await manager.save(
      body.phases.map((phase, index) =>
        manager.create(TrainingPlanPhaseEntity, {
          planId,
          position: index + 1,
          weeks: phase.weeks,
        }),
      ),
    );
    await manager.save(
      body.phases.flatMap((phase, index) =>
        phase.subjects.map((item) =>
          manager.create(TrainingPlanSubjectEntity, {
            phaseId: phases[index].id,
            subjectId: item.subjectId,
            minSessionsPerWeek: item.minSessionsPerWeek,
          }),
        ),
      ),
    );
  }
}
