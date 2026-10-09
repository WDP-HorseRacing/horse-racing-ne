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

const PLAN_NOT_FOUND = 'Không tìm thấy giáo án';

/**
 * Giáo án của Head Trainer: chia giai đoạn theo thứ tự, mỗi giai đoạn có số tuần và các môn theo thứ trong tuần; dùng lại cho các lớp của Head Trainer đó
 */
@Injectable()
export class TrainingPlansService {
  constructor(
    @InjectRepository(TrainingPlanEntity)
    private readonly plans: Repository<TrainingPlanEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
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
   * @param actor Thông tin danh tính từ Access Token
   * @param body Tên, mô tả và các giai đoạn theo thứ tự
   * @returns Promise trả về giáo án vừa tạo
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws BadRequestException Nếu có môn học không tồn tại, môn bị lặp hoặc thứ bị trùng trong một giai đoạn, hoặc tổng số tuần vượt giới hạn
   */
  async create(
    actor: Actor,
    body: SaveTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const caller = await this.access.currentUser(actor);
    const planId = await this.dataSource.transaction(async (manager) => {
      await this.assertSubjectsExist(manager, body);
      assertPlanPhases(body.phases);
      const plan = await manager.save(
        manager.create(TrainingPlanEntity, {
          name: body.name.trim(),
          description: body.description ?? null,
          headTrainerId: caller.id,
        }),
      );
      await this.savePhases(manager, plan.id, body);
      return plan.id;
    });
    return this.get(actor, planId);
  }

  /**
   * Thay toàn bộ tên, mô tả và các giai đoạn của giáo án; lớp đã tạo từ giáo án giữ nguyên buổi tập
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của giáo án
   * @param body Tên, mô tả và các giai đoạn theo thứ tự
   * @returns Promise trả về giáo án sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có giáo án hoặc giáo án của Head Trainer khác
   * @throws BadRequestException Nếu có môn học không tồn tại, môn bị lặp hoặc thứ bị trùng trong một giai đoạn, hoặc tổng số tuần vượt giới hạn
   */
  async update(
    actor: Actor,
    planId: string,
    body: SaveTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockedOwnPlan(manager, planId, caller.id);
      await this.assertSubjectsExist(manager, body);
      assertPlanPhases(body.phases);
      plan.name = body.name.trim();
      plan.description = body.description ?? null;
      await manager.save(plan);
      await manager.delete(TrainingPlanPhaseEntity, { planId });
      await this.savePhases(manager, planId, body);
    });
    return this.get(actor, planId);
  }

  /**
   * Xóa giáo án chưa có lớp nào dùng
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
      await this.lockedOwnPlan(manager, planId, caller.id);
      if (await manager.existsBy(TrainingClassEntity, { planId })) {
        throw new ConflictException('Giáo án đã có lớp dùng, không xóa được');
      }
      await manager.delete(TrainingPlanEntity, { id: planId });
    });
  }

  /**
   * Khóa giáo án của chính người gọi để sửa hoặc xóa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param planId UUID của giáo án
   * @param callerId UUID của Head Trainer gọi
   * @returns Promise trả về giáo án đã khóa
   * @throws NotFoundException Nếu không có giáo án hoặc giáo án của Head Trainer khác
   */
  private async lockedOwnPlan(
    manager: EntityManager,
    planId: string,
    callerId: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id: planId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan || plan.headTrainerId !== callerId) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return plan;
  }

  /**
   * Kiểm mọi môn trong các giai đoạn của giáo án đều tồn tại
   *
   * @param manager EntityManager của transaction đang chạy
   * @param body Nội dung giáo án gửi lên
   * @returns Promise hoàn tất khi kiểm xong
   * @throws BadRequestException Nếu có môn học không tồn tại
   */
  private async assertSubjectsExist(
    manager: EntityManager,
    body: SaveTrainingPlanDto,
  ): Promise<void> {
    const ids = [
      ...new Set(
        body.phases.flatMap((phase) =>
          phase.subjects.map((item) => item.subjectId),
        ),
      ),
    ];
    const found = await manager.countBy(TrainingSubjectEntity, { id: In(ids) });
    if (found !== ids.length) {
      throw new BadRequestException('Có môn học không tồn tại');
    }
  }

  /**
   * Lưu các giai đoạn của giáo án theo thứ tự gửi lên, vị trí bắt đầu từ 1, kèm các môn và thứ trong tuần của từng giai đoạn
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
            weekdays: item.weekdays,
          }),
        ),
      ),
    );
  }
}
