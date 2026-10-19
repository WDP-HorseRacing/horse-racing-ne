import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseStatusesService } from '../../horses/horse-statuses/horse-statuses.service';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../horses/shared/horse-ownership.service';
import { ExamRequestStatus } from '../constants/exam-request.enum';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import {
  MEDICAL_CASE_CLOSED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
} from '../constants/medical-events.constants';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import {
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
  toCaseActiveLock,
  toMedicalCaseResponse,
  toMedicalCostReport,
} from '../mappers/medical.mapper';
import {
  assertCaseOpen,
  assertInjuriesHealedBeforeClose,
  unhealedInjuryCount,
  assertNoLockChoiceOnDeath,
  canSeeDosage,
  resolveLockOnClose,
  visibleVisitCost,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';
import type { MedicalCostViewer } from '../types/medical-cost.types';
import type {
  MedicalCaseClosedEvent,
  TrainingLockReleasedEvent,
} from '../types/medical-events.types';
import { MedicalCasesRepository } from './medical-cases.repository';
import { MedicalRecordsService } from './medical-records.service';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

/**
 * Quyền xem chi phí đầy đủ, dùng khi cộng tổng chi phí của cả bệnh án.
 */
const ALL_COST_VIEWER: MedicalCostViewer = { seesCost: true, owner: null };

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
    private readonly ownerships: HorseOwnershipService,
    private readonly horseStatuses: HorseStatusesService,
  ) {}

  /**
   * Lấy các bệnh án của con ngựa, mới nhất lên trên, kèm tổng chi phí y tế của ngựa
   *
   * - Head Trainer không có key chi phí
   * - totalCost của mỗi bệnh án cộng các buổi khám chưa hủy của bệnh án đó
   * - totalCost của ngựa cộng mọi buổi khám chưa hủy, trong và ngoài bệnh án, không theo bộ lọc trạng thái
   * - Horse Owner: chỉ cộng các buổi khám thuộc giai đoạn mình sở hữu, nội dung bệnh án vẫn trả đủ
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
    const viewer = await this.records.costViewer(actor, horseId);
    const cases = await this.cases.find({
      where: { horseId, ...(query.status ? { status: query.status } : {}) },
      order: { openedAt: 'DESC' },
    });
    if (!viewer.seesCost) {
      return {
        items: cases.map((medicalCase) =>
          toMedicalCaseResponse(medicalCase, undefined),
        ),
      };
    }
    const visits = await this.medicalRecords.find({
      where: { horseId, voidedAt: IsNull() },
      select: {
        id: true,
        caseId: true,
        examDate: true,
        cost: true,
        voidedAt: true,
      },
    });
    return {
      items: cases.map((medicalCase) =>
        toMedicalCaseResponse(
          medicalCase,
          visibleVisitCost(
            viewer,
            visits.filter((visit) => visit.caseId === medicalCase.id),
          ),
        ),
      ),
      totalCost: visibleVisitCost(viewer, visits),
    };
  }

  /**
   * Lấy bệnh án kèm toàn bộ buổi khám, mới nhất lên trên
   *
   * - totalCost cộng các buổi khám chưa hủy của bệnh án; Head Trainer không có key chi phí
   * - Horse Owner: chỉ cộng buổi khám thuộc giai đoạn mình sở hữu; buổi khám thuộc giai đoạn chủ khác có cost null và costHidden true
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
    const viewer = await this.records.costViewer(actor, medicalCase.horseId);
    const visits = await this.medicalRecords.find({
      where: { caseId },
      order: { examDate: 'DESC' },
    });
    return {
      ...toMedicalCaseResponse(
        medicalCase,
        viewer.seesCost ? visibleVisitCost(viewer, visits) : undefined,
      ),
      visits: await this.records.toResponses(
        visits,
        canSeeDosage(actor.roles),
        viewer,
      ),
    };
  }

  /**
   * Lấy những gì bác sĩ cần xem trước khi đóng bệnh án: lệnh khóa gắn bệnh án, trạng thái sức khỏe, yêu cầu khám đang chờ, số chấn thương chưa lành, và hệ quả nếu đóng kèm ghi nhận ngựa mất
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
    const [activeLock, pendingRequestCount, deathImpact, injuryStatuses] =
      await Promise.all([
        manager.findOne(TrainingLockEntity, {
          where: { caseId, status: TrainingLockStatus.ACTIVE },
        }),
        manager.count(MedicalExamRequestEntity, {
          where: {
            horseId: medicalCase.horseId,
            status: ExamRequestStatus.PENDING,
          },
        }),
        this.horseStatuses.previewDeath(horse, manager),
        this.access.currentInjuryStatuses(manager, medicalCase.horseId),
      ]);
    return {
      activeLock: activeLock ? toCaseActiveLock(activeLock) : null,
      healthStatus: horse.healthStatus,
      healthWarning:
        horse.healthStatus === HorseHealthStatus.INJURED ||
        horse.healthStatus === HorseHealthStatus.QUARANTINED,
      pendingRequestCount,
      unhealedInjuryCount: unhealedInjuryCount(injuryStatuses),
      deathImpact,
    };
  }

  /**
   * Đóng bệnh án, chốt kết luận cuối
   *
   * - Chỉ Veterinarian (kiểm ở controller); khóa row ngựa rồi row bệnh án
   * - Lệnh khóa gắn bệnh án còn hiệu lực: bắt chọn gỡ ngay hoặc giữ kèm ngày dự kiến gỡ; mỗi nhánh ghi thêm một dòng nhật ký TRAINING_LOCK
   * - Trạng thái sức khỏe vẫn Chấn thương/Cách ly vẫn cho đóng
   * - Còn chấn thương chưa lành: 409, trừ khi đóng kèm ghi nhận ngựa mất
   * - Ghi event vào outbox trong cùng transaction: báo chủ ngựa và Club Manager kèm tổng chi phí các buổi khám chưa hủy lúc đóng và phần của chủ hiện tại; gỡ khóa thì báo Head Trainer và Club Manager
   * - Kèm ghi nhận ngựa mất (deceased = true): không nhận lựa chọn gỡ hay giữ khóa; sau khi đóng thì ghi nhận ngựa mất trong cùng transaction (HorseStatusesService.recordDeathInTransaction), lấy kết luận cuối làm nguyên nhân mất, ngày mất là hôm nay theo lịch câu lạc bộ; một bước lỗi thì hủy toàn bộ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param caseId UUID của bệnh án
   * @param body Kết luận cuối, cách xử lý lệnh khóa và cờ ghi nhận ngựa mất
   * @returns Promise trả về bệnh án sau khi đóng, kèm tổng chi phí
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có bệnh án, hoặc ngựa nằm ngoài phạm vi
   * @throws BadRequestException Nếu còn khóa mà không chọn cách xử lý, ngày dự kiến gỡ không hợp lệ, hoặc ghi nhận ngựa mất mà vẫn chọn gỡ hay giữ khóa
   * @throws ConflictException Nếu bệnh án đã đóng, ngựa đã chuyển nhượng hay đã mất, hoặc còn chấn thương chưa lành
   */
  async closeCase(
    actor: Actor,
    caseId: string,
    body: CloseMedicalCaseDto,
  ): Promise<MedicalCaseResponseDto> {
    const { horseId } = await this.findCase(caseId);
    const now = new Date();
    let totalCost = 0;
    const closed = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
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
      if (body.deceased === true) {
        assertNoLockChoiceOnDeath(body.lockDecision, body.lockExpectedEnd);
      }
      const decision =
        body.deceased !== true
          ? resolveLockOnClose(
              activeLock !== null,
              body.lockDecision,
              lockExpectedEnd,
              now,
            )
          : undefined;
      assertInjuriesHealedBeforeClose(
        await this.access.currentInjuryStatuses(manager, horseId),
        body.deceased === true,
      );

      const changes = {
        status: MedicalCaseStatus.CLOSED,
        closedAt: now,
        closedBy: caller.id,
        finalConclusion: body.finalConclusion,
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
          ...(decision !== undefined ? { lockDecision: decision } : {}),
          ...(body.deceased === true ? { deceased: true } : {}),
          ...(activeLock ? { trainingLockId: activeLock.id } : {}),
        },
        feature: MEDICAL_AUDIT_FEATURE.CLOSE_CASE,
      });
      const visits = await manager.find(MedicalRecordEntity, {
        where: { caseId, voidedAt: IsNull() },
      });
      totalCost = visibleVisitCost(ALL_COST_VIEWER, visits);
      const closedEvent: MedicalCaseClosedEvent = {
        eventId: randomUUID(),
        horseId,
        caseId,
        totalCost,
        ownerId: horse.ownerId,
        ownerCost: horse.ownerId
          ? visibleVisitCost(
              {
                seesCost: true,
                owner: {
                  ownerId: horse.ownerId,
                  periods: await this.ownerships.periodsOfHorse(
                    manager,
                    horseId,
                  ),
                },
              },
              visits,
            )
          : null,
      };
      await this.events.publish(
        manager,
        MEDICAL_CASE_CLOSED_EVENT,
        closedEvent,
      );
      if (activeLock && decision === CaseLockDecision.RELEASE) {
        const lockEvent: TrainingLockReleasedEvent = {
          eventId: randomUUID(),
          horseId,
          lockId: activeLock.id,
          conclusion: CLOSE_CASE_LOCK_RELEASE_CONCLUSION,
          ownerId: horse.ownerId,
        };
        await this.events.publish(
          manager,
          MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
          lockEvent,
        );
      }
      if (body.deceased === true) {
        await this.horseStatuses.recordDeathInTransaction(manager, {
          horse,
          recordedBy: caller.id,
          reason: body.finalConclusion,
        });
      }
      return { ...medicalCase, ...changes };
    });
    return toMedicalCaseResponse(closed, totalCost);
  }

  /**
   * Báo cáo tổng chi phí y tế theo khoảng ngày khám, lọc theo khu hoặc chủ ngựa
   *
   * @param actor Thông tin danh tính từ Access Token (chỉ Club Manager, kiểm ở controller)
   * @param query Khoảng ngày và bộ lọc
   * @returns Promise trả về tổng chi phí, số buổi khám và từng con ngựa
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
}
