import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import type { FieldError } from '../../../common/utils/field-errors';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  CreateTrainingSubjectDto,
  TrainingSubjectResponseDto,
  UpdateTrainingSubjectDto,
} from '../dto/training-subject.dto';
import { TrainingClassPhaseSubjectEntity } from '../entities/training-class-phase-subject.entity';
import { TrainingPlanSubjectEntity } from '../entities/training-plan-subject.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { toTrainingSubjectResponse } from '../mappers/training-subject.mapper';
import { assertSubjectExercise } from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { subjectAuditData } from '../utils/training-audit';

const SUBJECT_NAME_TAKEN: FieldError = {
  field: 'name',
  message: 'Tên môn học đã tồn tại',
};
const SUBJECT_NOT_FOUND = 'Không tìm thấy môn học';

/**
 * Danh mục môn học dùng chung toàn CLB: mỗi môn là một bài tập cố định
 */
@Injectable()
export class TrainingSubjectsService {
  constructor(
    @InjectRepository(TrainingSubjectEntity)
    private readonly subjects: Repository<TrainingSubjectEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê mọi môn học theo tên
   *
   * @returns Promise trả về các môn học, sắp theo tên tăng dần
   */
  async list(): Promise<TrainingSubjectResponseDto[]> {
    const rows = await this.subjects.find({ order: { name: 'ASC' } });
    return rows.map(toTrainingSubjectResponse);
  }

  /**
   * Lấy một môn học
   *
   * @param subjectId UUID của môn học
   * @returns Promise trả về môn học
   * @throws NotFoundException Nếu không có môn học
   */
  async get(subjectId: string): Promise<TrainingSubjectResponseDto> {
    const row = await this.subjects.findOneBy({ id: subjectId });
    if (!row) throw new NotFoundException(SUBJECT_NOT_FOUND);
    return toTrainingSubjectResponse(row);
  }

  /**
   * Thêm môn học mới
   *
   * - Ghi nhật ký kèm nội dung bài tập của môn
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Nội dung bài tập của môn
   * @returns Promise trả về môn học vừa tạo
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws BadRequestException Nếu môn chạy thử có cự ly 0, hoặc môn thường có thời gian mục tiêu
   * @throws ConflictException Nếu tên môn đã tồn tại
   */
  async create(
    actor: Actor,
    body: CreateTrainingSubjectDto,
  ): Promise<TrainingSubjectResponseDto> {
    const caller = await this.access.currentUser(actor);
    const targetTimeMs = body.targetTimeMs ?? null;
    assertSubjectExercise(
      body.sessionType,
      body.plannedDistanceM,
      targetTimeMs,
    );
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const row = await manager.save(
            manager.create(TrainingSubjectEntity, {
              name: body.name.trim(),
              description: body.description ?? null,
              sessionType: body.sessionType,
              intensity: body.intensity,
              plannedDistanceM: body.plannedDistanceM,
              durationMinutes: body.durationMinutes,
              surface: body.surface ?? null,
              targetTimeMs,
            }),
          );
          await this.auditService.record(manager, {
            actorId: caller.id,
            action: AuditAction.CREATE,
            entityType: AuditEntityType.TRAINING_SUBJECT,
            entityId: row.id,
            before: null,
            after: subjectAuditData(row),
            feature: AuditFeature.TRAIN_SUBJECT,
          });
          return row;
        }),
      SUBJECT_NAME_TAKEN,
    );
    return toTrainingSubjectResponse(saved);
  }

  /**
   * Sửa môn học; các buổi tập đã tạo từ môn này giữ nguyên
   *
   * - Field không gửi giữ giá trị cũ; gửi targetTimeMs null để xóa thời gian mục tiêu
   * - Có field đổi giá trị: ghi nhật ký giá trị trước và sau của các field đó
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param subjectId UUID của môn học
   * @param body Các field cần sửa
   * @returns Promise trả về môn học sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có môn học
   * @throws BadRequestException Nếu môn chạy thử có cự ly 0, hoặc môn thường có thời gian mục tiêu
   * @throws ConflictException Nếu tên môn đã tồn tại
   */
  async update(
    actor: Actor,
    subjectId: string,
    body: UpdateTrainingSubjectDto,
  ): Promise<TrainingSubjectResponseDto> {
    const caller = await this.access.currentUser(actor);
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const row = await manager.findOne(TrainingSubjectEntity, {
            where: { id: subjectId },
            lock: { mode: 'for_no_key_update' },
          });
          if (!row) throw new NotFoundException(SUBJECT_NOT_FOUND);
          const before = subjectAuditData(row);
          Object.assign(row, {
            name: body.name?.trim() ?? row.name,
            description:
              body.description === undefined
                ? row.description
                : body.description,
            sessionType: body.sessionType ?? row.sessionType,
            intensity: body.intensity ?? row.intensity,
            plannedDistanceM: body.plannedDistanceM ?? row.plannedDistanceM,
            durationMinutes: body.durationMinutes ?? row.durationMinutes,
            surface: body.surface === undefined ? row.surface : body.surface,
            targetTimeMs:
              body.targetTimeMs === undefined
                ? row.targetTimeMs
                : body.targetTimeMs,
          });
          assertSubjectExercise(
            row.sessionType,
            row.plannedDistanceM,
            row.targetTimeMs,
          );
          const saved = await manager.save(row);
          const diff = changedFieldsDiff(before, subjectAuditData(saved));
          if (diff) {
            await this.auditService.record(manager, {
              actorId: caller.id,
              action: AuditAction.UPDATE,
              entityType: AuditEntityType.TRAINING_SUBJECT,
              entityId: subjectId,
              ...diff,
              feature: AuditFeature.TRAIN_SUBJECT,
            });
          }
          return saved;
        }),
      SUBJECT_NAME_TAKEN,
    );
    return toTrainingSubjectResponse(saved);
  }

  /**
   * Xóa môn học chưa được giáo án hay buổi tập nào dùng
   *
   * - Ghi nhật ký kèm nội dung môn bị xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param subjectId UUID của môn học
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có môn học
   * @throws ConflictException Nếu môn đang có trong giáo án, giáo án của lớp hoặc buổi tập
   */
  async remove(actor: Actor, subjectId: string): Promise<void> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(TrainingSubjectEntity, {
        where: { id: subjectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException(SUBJECT_NOT_FOUND);
      if (
        (await manager.existsBy(TrainingPlanSubjectEntity, { subjectId })) ||
        (await manager.existsBy(TrainingClassPhaseSubjectEntity, {
          subjectId,
        })) ||
        (await manager.existsBy(TrainingSessionEntity, { subjectId }))
      ) {
        throw new ConflictException('Môn học đang được dùng, không xóa được');
      }
      const before = subjectAuditData(row);
      await manager.remove(row);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.TRAINING_SUBJECT,
        entityId: subjectId,
        before,
        after: null,
        feature: AuditFeature.TRAIN_SUBJECT,
      });
    });
  }
}
