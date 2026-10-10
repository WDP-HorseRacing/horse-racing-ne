import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { formatMeasurement } from '../../horses/utils/measurement-format';
import { HorseMeasurementAlert } from '../../horses/enums/horse-measurement-alert.enum';
import {
  assertLifecycleWritable,
  isReadOnlyLifecycle,
} from '../../horses/policies/horse.policy';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import { MEDICAL_EXAM_REQUEST_URGENT_EVENT } from '../constants/medical-events.constants';
import {
  CreateExamRequestDto,
  DismissExamRequestDto,
  ExamRequestListQueryDto,
  ExamRequestPageResponseDto,
  ExamRequestResponseDto,
  UpdateExamRequestUrgencyDto,
} from '../dto';
import { MedicalExamRequestEntity } from '../entities/medical-exam-request.entity';
import { toExamRequestResponse } from '../mappers/medical.mapper';
import {
  assertCanRequestExam,
  assertRequestPending,
  examRequestSourceFor,
  isGroomOnlyForExamRequests,
  isUrgentAlert,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import type { ExamRequestUrgentEvent } from '../types/medical-events.types';
import { MEDICAL_AUDIT_FEATURE } from '../constants/medical.constants';

@Injectable()
export class ExamRequestsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MedicalExamRequestEntity)
    private readonly requests: Repository<MedicalExamRequestEntity>,
    private readonly access: MedicalAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Gửi yêu cầu khám cho con ngựa
   *
   * - Veterinarian, Club Manager: mọi ngựa; Head Trainer: ngựa thuộc khu mình
   * - Khóa row ngựa; kiểm phạm vi người gửi trước, rồi mới chặn ngựa đã chuyển nhượng hoặc đã mất (ngoài phạm vi luôn là 403)
   * - Không tạo cho ngựa đã chuyển nhượng hoặc đã mất hoặc hồ sơ đã xóa
   * - Nguồn gốc theo vai trò người gửi; ghi nhật ký
   * - Yêu cầu Khẩn: ghi event báo mọi Veterinarian vào outbox trong cùng transaction
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Mô tả dấu hiệu và mức độ
   * @returns Promise trả về yêu cầu vừa tạo
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws ForbiddenException Nếu người gọi không được gửi yêu cầu cho con ngựa này
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất
   */
  async create(
    actor: Actor,
    horseId: string,
    body: CreateExamRequestDto,
  ): Promise<ExamRequestResponseDto> {
    const request = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.horseAccess.lockWritableHorseInScope(
        manager,
        actor,
        horseId,
      );
      assertCanRequestExam({
        roles: actor.roles,
        isInTrainerBarn:
          actor.roles.includes(UserRole.HEAD_TRAINER) &&
          (await this.horseAccess.isHorseInTrainerBarn(
            manager,
            horseId,
            caller.id,
          )),
      });
      assertLifecycleWritable(horse);
      const saved = await this.insert(manager, {
        horseId,
        requestedBy: caller.id,
        source: examRequestSourceFor(actor.roles),
        urgent: body.urgent === true,
        description: body.description,
        incidentId: null,
        alertType: null,
      });
      const created = { ...saved, horse };
      await this.announceCreated(manager, created);
      return created;
    });
    return toExamRequestResponse(request);
  }

  /**
   * Hàng đợi yêu cầu khám, Khẩn lên trước rồi cũ nhất lên trước
   *
   * - Veterinarian, Club Manager, Head Trainer: toàn câu lạc bộ
   * - Groom: chỉ yêu cầu của ngựa đang được phân công
   * - Mặc định chỉ lấy yêu cầu Chờ xử lý
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Trạng thái, mức độ và phân trang
   * @returns Promise trả về một trang yêu cầu khám
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async list(
    actor: Actor,
    query: ExamRequestListQueryDto,
  ): Promise<ExamRequestPageResponseDto> {
    const caller = await this.horseAccess.currentUser(actor);
    const qb = this.requests
      .createQueryBuilder('request')
      .innerJoinAndSelect('request.horse', 'horse')
      .withDeleted()
      .where('request.status = :status', {
        status: query.status ?? ExamRequestStatus.PENDING,
      });
    if (query.urgent !== undefined) {
      qb.andWhere('request.urgent = :urgent', { urgent: query.urgent });
    }
    if (isGroomOnlyForExamRequests(actor.roles)) {
      const horseIds = await this.assignedHorseIds(caller.id);
      if (horseIds.length === 0) {
        return new PaginationResponseDto([], 0, query.page, query.limit);
      }
      qb.andWhere('request.horseId IN (:...horseIds)', { horseIds });
    }
    const [items, total] = await qb
      .orderBy('request.urgent', 'DESC')
      .addOrderBy('request.createdAt', 'ASC')
      .addOrderBy('request.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginationResponseDto(
      items.map(toExamRequestResponse),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Mọi yêu cầu khám của một con ngựa, mới nhất lên trên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về danh sách yêu cầu khám
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi chỉ là Groom và không được phân công con ngựa này
   */
  async listByHorse(
    actor: Actor,
    horseId: string,
  ): Promise<ExamRequestResponseDto[]> {
    const horse = await this.horseAccess.findReadableHorseForActor(actor, horseId);
    if (isGroomOnlyForExamRequests(actor.roles)) {
      const caller = await this.horseAccess.currentUser(actor);
      if (!(await this.horseAccess.isGroomAssigned(horseId, caller.id))) {
        throw new ForbiddenException(
          'Bạn chỉ xem yêu cầu khám của ngựa được phân công',
        );
      }
    }
    const requests = await this.requests.find({
      where: { horseId },
      order: { createdAt: 'DESC' },
    });
    return requests.map((request) =>
      toExamRequestResponse({ ...request, horse }),
    );
  }

  /**
   * Bác sĩ đổi mức độ của yêu cầu đang chờ, bắt buộc lý do
   *
   * - Mức mới trùng mức cũ thì không ghi gì
   * - Nâng lên Khẩn thì ghi event báo mọi Veterinarian vào outbox trong cùng transaction, kể cả yêu cầu tự sinh từ cảnh báo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param requestId UUID của yêu cầu khám
   * @param body Mức độ mới và lý do
   * @returns Promise trả về yêu cầu sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có yêu cầu, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu yêu cầu không còn chờ, hoặc ngựa đã chuyển nhượng hoặc đã mất
   */
  async updateUrgency(
    actor: Actor,
    requestId: string,
    body: UpdateExamRequestUrgencyDto,
  ): Promise<ExamRequestResponseDto> {
    const horseId = await this.requestHorseId(requestId);
    const request = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const current = await this.lockRequest(manager, requestId);
      assertRequestPending(current.status);
      if (current.urgent === body.urgent) {
        return { ...current, horse };
      }
      await manager.update(
        MedicalExamRequestEntity,
        { id: requestId },
        { urgent: body.urgent },
      );
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.MEDICAL_EXAM_REQUEST,
        entityId: requestId,
        before: { urgent: current.urgent },
        after: { urgent: body.urgent },
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.EXAM_REQUEST,
      });
      const updated = { ...current, urgent: body.urgent, horse };
      if (body.urgent) await this.publishUrgent(manager, updated);
      return updated;
    });
    return toExamRequestResponse(request);
  }

  /**
   * Bác sĩ bỏ qua yêu cầu khám không cần khám, bắt buộc lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param requestId UUID của yêu cầu khám
   * @param body Lý do bỏ qua
   * @returns Promise trả về yêu cầu sau khi bỏ qua
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có yêu cầu, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu yêu cầu không còn chờ, hoặc ngựa đã chuyển nhượng hoặc đã mất
   */
  async dismiss(
    actor: Actor,
    requestId: string,
    body: DismissExamRequestDto,
  ): Promise<ExamRequestResponseDto> {
    const horseId = await this.requestHorseId(requestId);
    const dismissed = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockHorseForWrite(
        manager,
        actor,
        horseId,
      );
      const current = await this.lockRequest(manager, requestId);
      assertRequestPending(current.status);
      const changes = {
        status: ExamRequestStatus.DISMISSED,
        dismissReason: body.reason,
        handledBy: caller.id,
        handledAt: new Date(),
      };
      await manager.update(
        MedicalExamRequestEntity,
        { id: requestId },
        changes,
      );
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.MEDICAL_EXAM_REQUEST,
        entityId: requestId,
        before: { status: current.status },
        after: { status: ExamRequestStatus.DISMISSED },
        reason: body.reason,
        feature: MEDICAL_AUDIT_FEATURE.EXAM_REQUEST,
      });
      return { ...current, ...changes, horse };
    });
    return toExamRequestResponse(dismissed);
  }

  /**
   * Tạo yêu cầu khám từ báo cáo sự cố của Groom trong transaction đang mở
   *
   * - Không khóa row ngựa, không kiểm Groom được phân công và ngựa đã chuyển nhượng hoặc đã mất
   * - Không publish event; báo Veterinarian khi Khẩn bằng announceCreated trong cùng transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, báo cáo sự cố, người báo, mô tả và mức độ
   * @returns Promise trả về yêu cầu khám vừa tạo
   */
  createFromIncident(
    manager: EntityManager,
    input: {
      horseId: string;
      incidentId: string;
      reportedBy: string;
      description: string;
      urgent: boolean;
    },
  ): Promise<MedicalExamRequestEntity> {
    return this.insert(manager, {
      horseId: input.horseId,
      requestedBy: input.reportedBy,
      source: ExamRequestSource.GROOM_INCIDENT,
      urgent: input.urgent,
      description: input.description,
      incidentId: input.incidentId,
      alertType: null,
    });
  }

  /**
   * Tự sinh yêu cầu khám từ cảnh báo chỉ số cơ thể
   *
   * - Khóa row ngựa trước khi kiểm
   * - Bỏ qua ngựa đã chuyển nhượng hoặc đã mất hoặc hồ sơ đã xóa
   * - Sốt là Khẩn, sụt cân là Bình thường; người gửi là Hệ thống (requestedBy null)
   * - Mỗi ngựa chỉ một yêu cầu tự động PENDING cho mỗi loại cảnh báo: trùng thì bỏ qua (ON CONFLICT DO NOTHING)
   * - Mỗi lần đo chỉ sinh một yêu cầu cho mỗi loại cảnh báo: nhận lại cùng cảnh báo (kể cả khi yêu cầu cũ đã xử lý) thì bỏ qua
   * - Không gửi thêm thông báo
   *
   * @param event Payload của HORSE_MEASUREMENT_ALERT_EVENT
   * @returns Promise trả về true nếu đã tạo yêu cầu mới
   */
  async createFromAlert(event: HorseMeasurementAlertEvent): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const horse = await this.horseAccess.lockHorseWithDeleted(
        manager,
        event.horseId,
      );
      if (
        !horse ||
        horse.deletedAt ||
        isReadOnlyLifecycle(horse.lifecycleStatus)
      ) {
        return false;
      }
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(MedicalExamRequestEntity)
        .values({
          horseId: event.horseId,
          requestedBy: null,
          source: ExamRequestSource.MEASUREMENT_ALERT,
          urgent: isUrgentAlert(event.alert),
          description: describeAlert(event),
          status: ExamRequestStatus.PENDING,
          alertType: event.alert,
          sourceRefId: event.measurementId,
          version: 1,
        })
        .orIgnore()
        .returning(['id'])
        .execute();
      const created = result.raw as Array<{ id: string }>;
      if (created.length === 0) return false;
      await this.audit.record(manager, {
        actorId: null,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.MEDICAL_EXAM_REQUEST,
        entityId: created[0].id,
        before: null,
        after: {
          horseId: event.horseId,
          source: ExamRequestSource.MEASUREMENT_ALERT,
          alertType: event.alert,
          measurementId: event.measurementId,
        },
        feature: MEDICAL_AUDIT_FEATURE.EXAM_REQUEST,
      });
      return true;
    });
  }

  /**
   * Báo mọi Veterinarian khi có yêu cầu khám Khẩn do người dùng tạo
   *
   * - Yêu cầu không Khẩn hoặc tự sinh từ cảnh báo chỉ số: không ghi gì
   * - Còn lại: ghi MEDICAL_EXAM_REQUEST_URGENT_EVENT vào outbox trong cùng transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param request Yêu cầu khám vừa tạo
   * @returns Promise hoàn tất khi đã xử lý xong
   */
  async announceCreated(
    manager: EntityManager,
    request: MedicalExamRequestEntity,
  ): Promise<void> {
    if (
      !request.urgent ||
      request.source === ExamRequestSource.MEASUREMENT_ALERT
    ) {
      return;
    }
    await this.publishUrgent(manager, request);
  }

  /**
   * Ghi MEDICAL_EXAM_REQUEST_URGENT_EVENT báo mọi Veterinarian vào outbox trong cùng transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param request Yêu cầu khám mức Khẩn
   * @returns Promise hoàn tất khi đã ghi vào outbox
   */
  private async publishUrgent(
    manager: EntityManager,
    request: MedicalExamRequestEntity,
  ): Promise<void> {
    const event: ExamRequestUrgentEvent = {
      eventId: randomUUID(),
      horseId: request.horseId,
      requestId: request.id,
      description: request.description,
    };
    await this.events.publish(
      manager,
      MEDICAL_EXAM_REQUEST_URGENT_EVENT,
      event,
    );
  }

  /**
   * Lưu một yêu cầu khám Chờ xử lý và ghi nhật ký
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Dữ liệu yêu cầu khám
   * @returns Promise trả về yêu cầu vừa lưu
   */
  private async insert(
    manager: EntityManager,
    input: Pick<
      MedicalExamRequestEntity,
      | 'horseId'
      | 'requestedBy'
      | 'source'
      | 'urgent'
      | 'description'
      | 'incidentId'
      | 'alertType'
    >,
  ): Promise<MedicalExamRequestEntity> {
    const saved = await manager.save(
      manager.create(MedicalExamRequestEntity, {
        ...input,
        status: ExamRequestStatus.PENDING,
        dismissReason: null,
        handledBy: null,
        handledAt: null,
        medicalRecordId: null,
      }),
    );
    await this.audit.record(manager, {
      actorId: input.requestedBy,
      action: AuditAction.CREATE,
      entityType: AuditEntityType.MEDICAL_EXAM_REQUEST,
      entityId: saved.id,
      before: null,
      after: {
        horseId: input.horseId,
        source: input.source,
        urgent: input.urgent,
        ...(input.incidentId ? { incidentId: input.incidentId } : {}),
      },
      feature: MEDICAL_AUDIT_FEATURE.EXAM_REQUEST,
    });
    return saved;
  }

  /**
   * Lấy ngựa của yêu cầu khám trước khi mở transaction
   *
   * @param requestId UUID của yêu cầu khám
   * @returns Promise trả về UUID của ngựa
   * @throws NotFoundException Nếu không có yêu cầu
   */
  private async requestHorseId(requestId: string): Promise<string> {
    const request = await this.requests.findOne({
      where: { id: requestId },
      select: { id: true, horseId: true },
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu khám');
    return request.horseId;
  }

  /**
   * Khóa row yêu cầu khám trong transaction
   *
   * @param manager EntityManager của transaction đang chạy
   * @param requestId UUID của yêu cầu khám
   * @returns Promise trả về yêu cầu đã khóa
   */
  private lockRequest(
    manager: EntityManager,
    requestId: string,
  ): Promise<MedicalExamRequestEntity> {
    return manager.findOneOrFail(MedicalExamRequestEntity, {
      where: { id: requestId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Lấy các con ngựa groom đang được giao chăm (dòng groom_assignments còn mở)
   *
   * @param groomId UUID của groom
   * @returns Promise trả về danh sách UUID ngựa
   */
  private async assignedHorseIds(groomId: string): Promise<string[]> {
    const rows = await this.dataSource.manager.find(GroomAssignmentEntity, {
      where: { groomId, endAt: IsNull() },
      select: { horseId: true },
    });
    return rows.map((row) => row.horseId);
  }
}

/**
 * Soạn mô tả tiếng Việt cho yêu cầu khám tự sinh từ cảnh báo chỉ số
 *
 * @param event Payload của cảnh báo chỉ số
 * @returns Mô tả dấu hiệu
 */
function describeAlert(event: HorseMeasurementAlertEvent): string {
  return event.alert === HorseMeasurementAlert.FEVER
    ? `Cảnh báo tự động: sốt, thân nhiệt ${formatMeasurement(event.value, event.unit)}`
    : `Cảnh báo tự động: giảm ${event.dropPercent}% cân nặng (còn ${formatMeasurement(event.value, event.unit)})`;
}
