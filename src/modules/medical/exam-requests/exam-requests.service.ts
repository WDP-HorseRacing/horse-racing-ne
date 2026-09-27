import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseMeasurementAlert } from '../../horses/enums/horse-measurement-alert.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorsesSharedRepository } from '../../horses/shared/horses-shared.repository';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
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
  isUrgentAlert,
} from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import type { ExamRequestUrgentEvent } from '../types/medical-events.types';

@Injectable()
export class ExamRequestsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MedicalExamRequestEntity)
    private readonly requests: Repository<MedicalExamRequestEntity>,
    private readonly access: MedicalAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly horses: HorsesSharedRepository,
    private readonly audit: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Gửi yêu cầu khám cho con ngựa (F3.4)
   *
   * - Veterinarian, Club Manager: mọi ngựa; Head Trainer: ngựa thuộc khu mình; Groom: ngựa được phân công
   * - Khóa row ngựa; kiểm phạm vi người gửi trước, rồi mới chặn ngựa đã chuyển nhượng (ngoài phạm vi luôn là 403)
   * - Không tạo cho ngựa đã chuyển nhượng hoặc hồ sơ đã xóa
   * - Nguồn gốc theo vai trò người gửi; ghi nhật ký
   * - Yêu cầu Khẩn: sau commit báo mọi Veterinarian
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Mô tả dấu hiệu và mức độ
   * @returns A promise resolving to yêu cầu vừa tạo
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa ngoài phạm vi
   * @throws ForbiddenException Nếu người gọi không được gửi yêu cầu cho con ngựa này
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async create(
    actor: Actor,
    horseId: string,
    body: CreateExamRequestDto,
  ): Promise<ExamRequestResponseDto> {
    const request = await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.horseAccess.lockVisibleHorse(
        actor,
        horseId,
        manager,
      );
      assertCanRequestExam({
        roles: actor.roles,
        ...(await this.scopeFlags(manager, actor, caller.id, horseId)),
      });
      this.horseAccess.assertNotTransferred(horse);
      const saved = await this.insert(manager, {
        horseId,
        requestedBy: caller.id,
        source: examRequestSourceFor(actor.roles),
        urgent: body.urgent === true,
        description: body.description,
        incidentId: null,
        alertType: null,
      });
      return { ...saved, horse };
    });
    this.announceCreated(request);
    return toExamRequestResponse(request);
  }

  /**
   * Hàng đợi yêu cầu khám, Khẩn lên trước rồi cũ nhất lên trước (F3.4, F3.1 khối 4)
   *
   * - Veterinarian, Club Manager, Head Trainer: toàn câu lạc bộ
   * - Groom: chỉ yêu cầu của ngựa đang được phân công
   * - Mặc định chỉ lấy yêu cầu Chờ xử lý
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Trạng thái, mức độ và phân trang
   * @returns A promise resolving to một trang yêu cầu khám
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
    if (this.isGroomOnly(actor)) {
      const horseIds = await this.horses.assignedHorseIds(caller.id);
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
   * Mọi yêu cầu khám của một con ngựa, mới nhất lên trên (F3.4)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to danh sách yêu cầu khám
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi chỉ là Groom và không được phân công con ngựa này
   */
  async listByHorse(
    actor: Actor,
    horseId: string,
  ): Promise<ExamRequestResponseDto[]> {
    const horse = await this.horseAccess.findReadable(actor, horseId);
    if (this.isGroomOnly(actor)) {
      const caller = await this.horseAccess.currentUser(actor);
      if (!(await this.horses.isGroomAssigned(horseId, caller.id))) {
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
   * Bác sĩ đổi mức độ của yêu cầu đang chờ, bắt buộc lý do (F3.4 mục 5)
   *
   * - Mức mới trùng mức cũ thì không ghi gì
   * - Nâng lên Khẩn thì sau commit báo mọi Veterinarian, kể cả yêu cầu tự sinh từ cảnh báo (F3.4 mục 6)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param requestId UUID của yêu cầu khám
   * @param body Mức độ mới và lý do
   * @returns A promise resolving to yêu cầu sau khi đổi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có yêu cầu, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu yêu cầu không còn chờ, hoặc ngựa đã chuyển nhượng
   */
  async updateUrgency(
    actor: Actor,
    requestId: string,
    body: UpdateExamRequestUrgencyDto,
  ): Promise<ExamRequestResponseDto> {
    const horseId = await this.requestHorseId(requestId);
    const { request, raised } = await this.dataSource.transaction(
      async (manager) => {
        const { caller, horse } = await this.access.lockHorseForWrite(
          manager,
          actor,
          horseId,
        );
        const current = await this.lockRequest(manager, requestId);
        assertRequestPending(current.status);
        if (current.urgent === body.urgent) {
          return { request: { ...current, horse }, raised: false };
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
          feature: 'F3.4',
        });
        return {
          request: { ...current, urgent: body.urgent, horse },
          raised: body.urgent,
        };
      },
    );
    if (raised) this.publishUrgent(request);
    return toExamRequestResponse(request);
  }

  /**
   * Bác sĩ bỏ qua yêu cầu khám không cần khám, bắt buộc lý do (F3.4 mục 4)
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param requestId UUID của yêu cầu khám
   * @param body Lý do bỏ qua
   * @returns A promise resolving to yêu cầu sau khi bỏ qua
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có yêu cầu, hoặc ngựa ngoài phạm vi
   * @throws ConflictException Nếu yêu cầu không còn chờ, hoặc ngựa đã chuyển nhượng
   */
  async dismiss(
    actor: Actor,
    requestId: string,
    body: DismissExamRequestDto,
  ): Promise<ExamRequestResponseDto> {
    const horseId = await this.requestHorseId(requestId);
    return this.dataSource.transaction(async (manager) => {
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
        feature: 'F3.4',
      });
      return toExamRequestResponse({ ...current, ...changes, horse });
    });
  }

  /**
   * Tạo yêu cầu khám từ báo cáo sự cố của Groom (Flow 4). Dùng cho module stable gọi trong transaction của họ.
   *
   * - Nơi gọi đã khóa row ngựa, kiểm Groom được phân công và ngựa chưa chuyển nhượng
   * - Không publish event; sau commit nơi gọi gọi announceCreated để báo Veterinarian nếu Khẩn
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, báo cáo sự cố, người báo, mô tả và mức độ
   * @returns A promise resolving to yêu cầu khám vừa tạo
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
   * Tự sinh yêu cầu khám từ cảnh báo chỉ số của F1.5 (Flow 3 mục III.5.3–III.5.6)
   *
   * - Khóa row ngựa trước khi kiểm, để không chèn yêu cầu vào ngựa đang được chuyển nhượng hoặc xóa trong transaction khác
   * - Bỏ qua ngựa đã chuyển nhượng hoặc hồ sơ đã xóa; việc bỏ qua số đo lấy trong buổi khám nằm ở listener
   * - Sốt là Khẩn, sụt cân là Bình thường; người gửi là Hệ thống (requestedBy null)
   * - Mỗi ngựa chỉ một yêu cầu tự động PENDING cho mỗi loại cảnh báo: trùng thì bỏ qua (ON CONFLICT DO NOTHING)
   * - Không gửi thêm thông báo vì cảnh báo F1.5 đã báo
   *
   * @param event Payload của HORSE_MEASUREMENT_ALERT_EVENT
   * @returns A promise resolving to true nếu đã tạo yêu cầu mới
   */
  async createFromAlert(event: HorseMeasurementAlertEvent): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const horse = await manager.findOne(HorseEntity, {
        where: { id: event.horseId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !horse ||
        horse.deletedAt ||
        horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED
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
        feature: 'F3.4',
      });
      return true;
    });
  }

  /**
   * Báo mọi Veterinarian khi có yêu cầu khám Khẩn do người dùng tạo hoặc vừa nâng lên Khẩn (F3.4 mục 6). Gọi sau khi commit
   *
   * @param request Yêu cầu khám
   */
  announceCreated(request: MedicalExamRequestEntity): void {
    if (
      !request.urgent ||
      request.source === ExamRequestSource.MEASUREMENT_ALERT
    ) {
      return;
    }
    this.publishUrgent(request);
  }

  /**
   * Phát MEDICAL_EXAM_REQUEST_URGENT_EVENT để báo mọi Veterinarian. Gọi sau khi commit
   *
   * @param request Yêu cầu khám mức Khẩn
   */
  private publishUrgent(request: MedicalExamRequestEntity): void {
    const event: ExamRequestUrgentEvent = {
      eventId: randomUUID(),
      horseId: request.horseId,
      requestId: request.id,
      description: request.description,
    };
    this.events.publish(MEDICAL_EXAM_REQUEST_URGENT_EVENT, event);
  }

  /**
   * Lưu một yêu cầu khám Chờ xử lý và ghi nhật ký
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Dữ liệu yêu cầu khám
   * @returns A promise resolving to yêu cầu vừa lưu
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
      feature: 'F3.4',
    });
    return saved;
  }

  /**
   * Chỉ query khu phụ trách khi người gọi là Head Trainer, chỉ query phân công khi là Groom
   *
   * @param manager EntityManager của transaction đang chạy
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID người gọi
   * @param horseId UUID của ngựa
   * @returns A promise resolving to cờ ngựa thuộc khu của Head Trainer và Groom được phân công
   */
  private async scopeFlags(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<{ isInTrainerBarn: boolean; isAssignedGroom: boolean }> {
    const [isInTrainerBarn, isAssignedGroom] = await Promise.all([
      actor.roles.includes(UserRole.HEAD_TRAINER)
        ? this.horseAccess.isHorseInTrainerBarn(manager, horseId, callerId)
        : Promise.resolve(false),
      actor.roles.includes(UserRole.GROOM)
        ? this.horses.isGroomAssigned(horseId, callerId, manager)
        : Promise.resolve(false),
    ]);
    return { isInTrainerBarn, isAssignedGroom };
  }

  /**
   * Người gọi chỉ có vai trò Groom trong số các vai trò được xem yêu cầu khám
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns True nếu phạm vi xem bị giới hạn theo phân công
   */
  private isGroomOnly(actor: Actor): boolean {
    return (
      actor.roles.includes(UserRole.GROOM) &&
      ![
        UserRole.VETERINARIAN,
        UserRole.CLUB_MANAGER,
        UserRole.HEAD_TRAINER,
      ].some((role) => actor.roles.includes(role))
    );
  }

  /**
   * Lấy ngựa của yêu cầu khám trước khi mở transaction, để khóa row ngựa trước row yêu cầu
   *
   * @param requestId UUID của yêu cầu khám
   * @returns A promise resolving to UUID của ngựa
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
   * @returns A promise resolving to yêu cầu đã khóa
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
}

/**
 * Soạn mô tả tiếng Việt cho yêu cầu khám tự sinh từ cảnh báo chỉ số
 *
 * @param event Payload của cảnh báo chỉ số
 * @returns Mô tả dấu hiệu
 */
function describeAlert(event: HorseMeasurementAlertEvent): string {
  return event.alert === HorseMeasurementAlert.FEVER
    ? `Cảnh báo tự động: sốt, thân nhiệt ${event.value} ${event.unit}`
    : `Cảnh báo tự động: giảm ${event.dropPercent}% cân nặng (còn ${event.value} ${event.unit})`;
}
