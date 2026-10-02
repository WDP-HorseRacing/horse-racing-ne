import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import {
  MEDICAL_CASE_CLOSED_EVENT,
  MEDICAL_CASE_COST_ADJUSTED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
} from '../constants/medical-events.constants';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import {
  AdjustCaseCostDto,
  CloseMedicalCaseDto,
  MedicalCaseClosePreviewResponseDto,
  MedicalCaseDetailResponseDto,
  MedicalCaseListQueryDto,
  MedicalCaseListResponseDto,
  MedicalCaseResponseDto,
  MedicalCostReportQueryDto,
  MedicalCostReportResponseDto,
} from '../dto';
import { MedicalCaseEntity } from '../entities/medical-case.entity';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import {
  costOf,
  toCaseActiveLock,
  toMedicalCaseResponse,
  toMedicalCostReport,
} from '../mappers/medical.mapper';
import {
  assertCaseOpen,
  assertCostAdjustable,
  canSeeDosage,
  canSeeMedicalCost,
  resolveLockOnClose,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';
import type {
  MedicalCaseClosedEvent,
  MedicalCaseCostAdjustedEvent,
  TrainingLockReleasedEvent,
} from '../types/medical-events.types';
import { MedicalCasesRepository } from './medical-cases.repository';
import { MedicalRecordsService } from './medical-records.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

/**
 * Kết luận ghi vào lệnh khóa khi bác sĩ chọn gỡ khóa lúc đóng bệnh án.
 */
const CLOSE_CASE_LOCK_RELEASE_CONCLUSION = 'Gỡ khi đóng bệnh án';

@Injectable()
export class MedicalCasesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly horseAccess: HorseAccessService,
    private readonly access: MedicalAccessService,
    private readonly lockWrites: TrainingLockWritesService,
    private readonly records: MedicalRecordsService,
    private readonly casesRepository: MedicalCasesRepository,
    @InjectRepository(MedicalCaseEntity)
    private readonly cases: Repository<MedicalCaseEntity>,
    @InjectRepository(MedicalRecordEntity)
    private readonly medicalRecords: Repository<MedicalRecordEntity>,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Lấy các bệnh án của con ngựa, mới nhất lên trên, kèm tổng chi phí các bệnh án đã đóng
   *
   * - Head Trainer không có key chi phí; người khác chỉ thấy chi phí của bệnh án đã đóng
   * - totalCost tính trên mọi bệnh án đã đóng của ngựa, không theo bộ lọc trạng thái
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Lọc theo trạng thái bệnh án
   * @returns Promise trả về danh sách bệnh án và tổng chi phí
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listCases(
    actor: Actor,
    horseId: string,
    query: MedicalCaseListQueryDto,
  ): Promise<MedicalCaseListResponseDto> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    const cases = await this.cases.find({
      where: { horseId, ...(query.status ? { status: query.status } : {}) },
      order: { openedAt: 'DESC' },
    });
    const seesCost = canSeeMedicalCost(actor.roles);
    const items = cases.map((medicalCase) =>
      toMedicalCaseResponse(medicalCase, seesCost),
    );
    if (!seesCost) return { items };
    return {
      items,
      totalCost: await this.closedCostOfHorse(horseId),
    };
  }

  /**
   * Lấy bệnh án kèm toàn bộ buổi khám, mới nhất lên trên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @returns Promise trả về bệnh án và các buổi khám
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getCase(
    actor: Actor,
    caseId: string,
  ): Promise<MedicalCaseDetailResponseDto> {
    const medicalCase = await this.findCase(caseId);
    await this.horseAccess.findReadableHorseForActor(actor, medicalCase.horseId);
    const visits = await this.medicalRecords.find({
      where: { caseId },
      order: { examDate: 'DESC' },
    });
    return {
      ...toMedicalCaseResponse(medicalCase, canSeeMedicalCost(actor.roles)),
      visits: await this.records.toResponses(visits, canSeeDosage(actor.roles)),
    };
  }

  /**
   * Lấy những gì bác sĩ cần xem trước khi đóng bệnh án: lệnh khóa gắn bệnh án, trạng thái sức khỏe, yêu cầu khám đang chờ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @returns Promise trả về thông tin xem trước
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa nằm ngoài phạm vi
   * @throws ConflictException Nếu bệnh án đã đóng
   */
  async closePreview(
    actor: Actor,
    caseId: string,
  ): Promise<MedicalCaseClosePreviewResponseDto> {
    const medicalCase = await this.findCase(caseId);
    const horse = await this.horseAccess.findReadableHorseForActor(
      actor,
      medicalCase.horseId,
    );
    assertCaseOpen(medicalCase.status);
    const manager = this.dataSource.manager;
    const [activeLock, pendingRequestCount] = await Promise.all([
      manager.findOne(TrainingLockEntity, {
        where: { caseId, status: TrainingLockStatus.ACTIVE },
      }),
      manager.count(MedicalExamRequestEntity, {
        where: {
          horseId: medicalCase.horseId,
          status: ExamRequestStatus.PENDING,
        },
      }),
    ]);
    return {
      activeLock: activeLock ? toCaseActiveLock(activeLock) : null,
      healthStatus: horse.healthStatus,
      healthWarning:
        horse.healthStatus === HorseHealthStatus.INJURED ||
        horse.healthStatus === HorseHealthStatus.QUARANTINED,
      pendingRequestCount,
    };
  }

  /**
   * Đóng bệnh án, chốt kết luận cuối và chi phí
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi row bệnh án
   * - Lệnh khóa gắn bệnh án còn hiệu lực: bắt chọn gỡ ngay hoặc giữ kèm ngày dự kiến gỡ; mỗi nhánh ghi thêm một dòng nhật ký TRAINING_LOCK
   * - Trạng thái sức khỏe vẫn Chấn thương/Cách ly vẫn cho đóng
   * - Sau commit: báo chủ ngựa và Club Manager; gỡ khóa thì báo Head Trainer và Club Manager
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @param body Kết luận cuối, chi phí và cách xử lý lệnh khóa
   * @returns Promise trả về bệnh án sau khi đóng
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa nằm ngoài phạm vi
   * @throws BadRequestException Nếu còn khóa mà không chọn cách xử lý, hoặc ngày dự kiến gỡ không hợp lệ
   * @throws ConflictException Nếu bệnh án đã đóng, hoặc ngựa đã chuyển nhượng
   */
  async closeCase(
    actor: Actor,
    caseId: string,
    body: CloseMedicalCaseDto,
  ): Promise<MedicalCaseResponseDto> {
    const { horseId } = await this.findCase(caseId);
    const now = new Date();
    const { closed, releasedLockId } = await this.dataSource.transaction(
      async (manager) => {
        const { caller } = await this.access.lockHorseForWrite(
          manager,
          actor,
          horseId,
        );
        const medicalCase = await manager.findOneOrFail(MedicalCaseEntity, {
          where: { id: caseId },
          lock: { mode: 'pessimistic_write' },
        });
        assertCaseOpen(medicalCase.status);
        const activeLock = await manager.findOne(TrainingLockEntity, {
          where: { caseId, status: TrainingLockStatus.ACTIVE },
          lock: { mode: 'pessimistic_write' },
        });
        const lockExpectedEnd = body.lockExpectedEnd
          ? new Date(body.lockExpectedEnd)
          : undefined;
        const decision = resolveLockOnClose(
          activeLock !== null,
          body.lockDecision,
          lockExpectedEnd,
          now,
        );

        const changes = {
          status: MedicalCaseStatus.CLOSED,
          closedAt: now,
          closedBy: caller.id,
          finalConclusion: body.finalConclusion,
          totalCost: String(body.totalCost),
        };
        await manager.update(MedicalCaseEntity, { id: caseId }, changes);
        if (activeLock && decision === CaseLockDecision.RELEASE) {
          await this.lockWrites.releaseLock(manager, activeLock.id, {
            releasedBy: caller.id,
            releasedAt: now,
            releaseConclusion: CLOSE_CASE_LOCK_RELEASE_CONCLUSION,
          });
          await this.audit.record(manager, {
            actorId: caller.id,
            action: AuditAction.UPDATE,
            entityType: AuditEntityType.TRAINING_LOCK,
            entityId: activeLock.id,
            before: { status: activeLock.status },
            after: { status: TrainingLockStatus.RELEASED, caseId },
            reason: CLOSE_CASE_LOCK_RELEASE_CONCLUSION,
            feature: MEDICAL_AUDIT_FEATURE.CLOSE_CASE,
          });
        }
        if (activeLock && decision === CaseLockDecision.KEEP) {
          await this.lockWrites.extendLockEnd(
            manager,
            activeLock.id,
            lockExpectedEnd,
          );
          await this.audit.record(manager, {
            actorId: caller.id,
            action: AuditAction.UPDATE,
            entityType: AuditEntityType.TRAINING_LOCK,
            entityId: activeLock.id,
            before: { lockEnd: activeLock.lockEnd },
            after: { lockEnd: lockExpectedEnd, caseId },
            feature: MEDICAL_AUDIT_FEATURE.CLOSE_CASE,
          });
        }
        await this.audit.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.MEDICAL_CASE,
          entityId: caseId,
          before: { status: MedicalCaseStatus.OPEN },
          after: {
            status: MedicalCaseStatus.CLOSED,
            finalConclusion: body.finalConclusion,
            totalCost: body.totalCost,
            lockDecision: decision,
            ...(activeLock ? { trainingLockId: activeLock.id } : {}),
          },
          feature: MEDICAL_AUDIT_FEATURE.CLOSE_CASE,
        });
        return {
          closed: { ...medicalCase, ...changes },
          releasedLockId:
            activeLock && decision === CaseLockDecision.RELEASE
              ? activeLock.id
              : null,
        };
      },
    );

    const closedEvent: MedicalCaseClosedEvent = {
      eventId: randomUUID(),
      horseId,
      caseId,
      totalCost: body.totalCost,
    };
    this.events.publish(MEDICAL_CASE_CLOSED_EVENT, closedEvent);
    if (releasedLockId) {
      const lockEvent: TrainingLockReleasedEvent = {
        eventId: randomUUID(),
        horseId,
        lockId: releasedLockId,
        conclusion: CLOSE_CASE_LOCK_RELEASE_CONCLUSION,
      };
      this.events.publish(MEDICAL_TRAINING_LOCK_RELEASED_EVENT, lockEvent);
    }
    return toMedicalCaseResponse(closed, true);
  }

  /**
   * Điều chỉnh chi phí của bệnh án đã đóng, bắt buộc lý do
   *
   * - Số mới trùng số cũ thì không ghi gì và không báo
   * - Ghi nhật ký giá trị trước, sau và lý do; sau commit báo lại chủ ngựa và Club Manager
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @param body Chi phí mới và lý do
   * @returns Promise trả về bệnh án sau khi điều chỉnh
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa nằm ngoài phạm vi
   * @throws ConflictException Nếu bệnh án chưa đóng, hoặc ngựa đã chuyển nhượng
   */
  async adjustCost(
    actor: Actor,
    caseId: string,
    body: AdjustCaseCostDto,
  ): Promise<MedicalCaseResponseDto> {
    const { horseId } = await this.findCase(caseId);
    const { updated, fromCost } = await this.dataSource.transaction(
      async (manager) => {
        const { caller } = await this.access.lockHorseForWrite(
          manager,
          actor,
          horseId,
        );
        const medicalCase = await manager.findOneOrFail(MedicalCaseEntity, {
          where: { id: caseId },
          lock: { mode: 'pessimistic_write' },
        });
        assertCostAdjustable(medicalCase.status);
        const previous = costOf(medicalCase) ?? 0;
        if (previous === body.totalCost) {
          return { updated: medicalCase, fromCost: null };
        }
        const totalCost = String(body.totalCost);
        await manager.update(MedicalCaseEntity, { id: caseId }, { totalCost });
        await this.audit.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.MEDICAL_CASE,
          entityId: caseId,
          before: { totalCost: previous },
          after: { totalCost: body.totalCost },
          reason: body.reason,
          feature: MEDICAL_AUDIT_FEATURE.CLOSE_CASE,
        });
        return { updated: { ...medicalCase, totalCost }, fromCost: previous };
      },
    );
    if (fromCost !== null) {
      const event: MedicalCaseCostAdjustedEvent = {
        eventId: randomUUID(),
        horseId,
        caseId,
        fromCost,
        toCost: body.totalCost,
      };
      this.events.publish(MEDICAL_CASE_COST_ADJUSTED_EVENT, event);
    }
    return toMedicalCaseResponse(updated, true);
  }

  /**
   * Báo cáo tổng chi phí y tế theo khoảng ngày đóng bệnh án, lọc theo khu hoặc chủ ngựa
   *
   * @param actor Thông tin danh tính từ Access Token (chỉ Club Manager, kiểm ở controller)
   * @param query Khoảng ngày và bộ lọc
   * @returns Promise trả về tổng chi phí, số bệnh án và từng con ngựa
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async costReport(
    actor: Actor,
    query: MedicalCostReportQueryDto,
  ): Promise<MedicalCostReportResponseDto> {
    await this.horseAccess.currentUser(actor);
    const { from, to } = query;
    if (from > to) {
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    }
    const rows = await this.casesRepository.costByHorse({
      from,
      to,
      barnId: query.barnId,
      ownerId: query.ownerId,
    });
    return toMedicalCostReport(from, to, rows);
  }

  /**
   * Tìm bệnh án theo id
   *
   * @param caseId UUID của bệnh án
   * @returns Promise trả về bệnh án
   * @throws NotFoundException Nếu không có bệnh án
   */
  private async findCase(caseId: string): Promise<MedicalCaseEntity> {
    const medicalCase = await this.cases.findOne({ where: { id: caseId } });
    if (!medicalCase) throw new NotFoundException('Không tìm thấy bệnh án');
    return medicalCase;
  }

  /**
   * Cộng chi phí mọi bệnh án đã đóng của một con ngựa
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về tổng chi phí (VND), 0 nếu chưa có bệnh án đã đóng
   */
  private async closedCostOfHorse(horseId: string): Promise<number> {
    const row = await this.cases
      .createQueryBuilder('medicalCase')
      .select('COALESCE(SUM(medicalCase.totalCost), 0)', 'totalCost')
      .where('medicalCase.horseId = :horseId', { horseId })
      .andWhere('medicalCase.status = :status', {
        status: MedicalCaseStatus.CLOSED,
      })
      .getRawOne<{ totalCost: string }>();
    return Number(row?.totalCost ?? 0);
  }
}
