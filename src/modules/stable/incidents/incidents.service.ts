import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { mapUniqueViolation } from '../../../common/utils/unique-violation';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { MediaService } from '../../media/services/media.service';
import { MedicalExamRequestEntity } from '../../medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../medical/exam-requests/exam-requests.service';
import { currentUserForActor } from '../../users/utils/current-user';
import { IncidentStatus } from '../constants/incident-status.enum';
import { INCIDENT_REPORTED_EVENT } from '../constants/stable-events.constants';
import {
  IncidentListQueryDto,
  IncidentPageResponseDto,
  IncidentResponseDto,
  ReferIncidentDto,
  ReportIncidentDto,
  ResolveIncidentDto,
} from '../dto/incident.dto';
import { IncidentEntity } from '../entities/incident.entity';
import { toIncidentResponse } from '../mappers/incident.mapper';
import {
  assertIncidentNotReferred,
  assertIncidentOpen,
  assertIncidentResolvable,
} from '../policies/incident.policy';
import { assertHorseLifecycleWritable } from '../policies/stable.policy';
import { StableAccessService } from '../shared/stable-access.service';
import type { IncidentReportedEvent } from '../types/stable-events.types';

const INCIDENT_RELATIONS = {
  horse: true,
  reporter: true,
  resolver: true,
} as const;

const INCIDENT_NOT_FOUND = 'Không tìm thấy sự cố';

/**
 * Sự cố tại chuồng: Groom báo, Head Trainer của khu chuyển bác sĩ và đóng
 */
@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    private readonly access: StableAccessService,
    private readonly horseAccess: HorseAccessService,
    private readonly media: MediaService,
    private readonly examRequests: ExamRequestsService,
    private readonly events: DomainEventPublisher,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Liệt kê sự cố mới nhất trước
   *
   * - Club Manager, Veterinarian: mọi sự cố
   * - Head Trainer: sự cố của ngựa thuộc khu mình phụ trách
   * - Groom: sự cố mình báo
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Lọc trạng thái, ngựa, khu và phân trang
   * @returns Promise trả về một trang sự cố
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   */
  async list(
    actor: Actor,
    query: IncidentListQueryDto,
  ): Promise<IncidentPageResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const qb = this.incidents
      .createQueryBuilder('incident')
      .withDeleted()
      .innerJoinAndSelect('incident.horse', 'horse')
      .innerJoinAndSelect('incident.reporter', 'reporter')
      .leftJoinAndSelect('incident.resolver', 'resolver')
      .orderBy('incident.createdAt', 'DESC')
      .addOrderBy('incident.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);
    if (query.status) {
      qb.andWhere('incident.status = :status', { status: query.status });
    }
    if (query.horseId) {
      qb.andWhere('incident.horseId = :horseId', { horseId: query.horseId });
    }
    if (query.barnId) {
      qb.andWhere('horse.barnId = :barnId', { barnId: query.barnId });
    }
    if (!this.seesAll(actor)) {
      if (this.horseAccess.hasRole(actor, UserRole.HEAD_TRAINER)) {
        qb.innerJoin(
          'horse.barn',
          'scopeBarn',
          'scopeBarn.deletedAt IS NULL AND scopeBarn.headTrainerId = :callerId',
          { callerId: caller.id },
        ).andWhere('horse.deletedAt IS NULL');
      } else {
        qb.andWhere('incident.reportedBy = :callerId', {
          callerId: caller.id,
        });
      }
    }
    const [rows, total] = await qb.getManyAndCount();
    return new PaginationResponseDto(
      await this.toResponses(this.dataSource.manager, rows),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Groom báo sự cố cho ngựa mình phụ trách
   *
   * - Kiểm ngựa và phân công trước khi kiểm ảnh, kiểm lại sau khi khóa ngựa
   * - Sự cố khẩn: tạo yêu cầu khám khẩn gắn sự cố và báo mọi bác sĩ trong cùng transaction
   * - Ghi INCIDENT_REPORTED_EVENT vào outbox để báo Head Trainer của khu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Ngựa, mô tả, cờ khẩn, ảnh
   * @returns Promise trả về sự cố vừa báo
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không do người gọi phụ trách
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa, hoặc không có ảnh của người gọi
   * @throws BadRequestException Nếu ảnh không phải ảnh sự cố hoặc không đạt giới hạn
   * @throws ConflictException Nếu ảnh chưa có trên storage hoặc đã gắn cho sự cố khác, hoặc ngựa đã chuyển nhượng hay đã mất
   */
  async report(
    actor: Actor,
    body: ReportIncidentDto,
  ): Promise<IncidentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.assertCanReport(
      this.dataSource.manager,
      await this.horseAccess.findWritableHorse(actor, body.horseId),
      caller.id,
    );
    if (body.photoMediaId) {
      await this.media.assertAttachableIncidentPhoto(
        caller.id,
        body.photoMediaId,
      );
    }
    const urgent = body.urgent === true;
    const description = body.description.trim();
    const id = await mapUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const horse = await this.horseAccess.lockWritableHorse(
            manager,
            actor,
            body.horseId,
          );
          await this.assertCanReport(manager, horse, caller.id);
          const incident = await manager.save(
            manager.create(IncidentEntity, {
              horseId: horse.id,
              reportedBy: caller.id,
              description,
              mediaAssetId: body.photoMediaId ?? null,
              status: IncidentStatus.OPEN,
            }),
          );
          if (urgent) {
            const exam = await this.examRequests.createFromIncident(manager, {
              horseId: horse.id,
              incidentId: incident.id,
              reportedBy: caller.id,
              description,
              urgent: true,
            });
            await this.examRequests.announceCreated(manager, exam);
          }
          const event: IncidentReportedEvent = {
            eventId: incident.id,
            incidentId: incident.id,
            horseId: horse.id,
            urgent,
            description,
          };
          await this.events.publish(manager, INCIDENT_REPORTED_EVENT, event);
          return incident.id;
        }),
      { incidents_media_asset_uq: 'Ảnh đã gắn cho sự cố khác' },
    );
    return this.get(actor, id);
  }

  /**
   * Lấy một sự cố
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của sự cố
   * @returns Promise trả về sự cố kèm ảnh và yêu cầu khám
   * @throws ForbiddenException Nếu tài khoản không hoạt động, Head Trainer xem sự cố ngoài khu, hoặc Groom xem sự cố không do mình báo
   * @throws NotFoundException Nếu không có sự cố
   */
  async get(actor: Actor, id: string): Promise<IncidentResponseDto> {
    const manager = this.dataSource.manager;
    const caller = await currentUserForActor(manager, actor);
    const incident = await manager.findOne(IncidentEntity, {
      where: { id },
      relations: INCIDENT_RELATIONS,
      withDeleted: true,
    });
    if (!incident) throw new NotFoundException(INCIDENT_NOT_FOUND);
    await this.assertCanView(manager, actor, caller.id, incident);
    const [response] = await this.toResponses(manager, [incident]);
    return response;
  }

  /**
   * Head Trainer của khu chuyển sự cố đang mở cho bác sĩ: tạo yêu cầu khám gắn sự cố
   *
   * - Khẩn: ghi event báo mọi bác sĩ vào outbox trong cùng transaction
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của sự cố
   * @param body Mức khẩn của yêu cầu khám
   * @returns Promise trả về sự cố kèm yêu cầu khám
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có sự cố hoặc ngựa
   * @throws ConflictException Nếu ngựa chưa có khu, đã chuyển nhượng hoặc đã mất; sự cố đã đóng; hoặc đã chuyển bác sĩ
   */
  async refer(
    actor: Actor,
    id: string,
    body: ReferIncidentDto,
  ): Promise<IncidentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const incident = await this.lockIncident(manager, id);
      await this.access.lockOperableHorse(
        manager,
        caller.id,
        incident.horseId,
        'INCIDENT',
      );
      assertIncidentOpen(incident.status);
      assertIncidentNotReferred(
        await manager.exists(MedicalExamRequestEntity, {
          where: { incidentId: incident.id },
        }),
      );
      const exam = await this.examRequests.createFromIncident(manager, {
        horseId: incident.horseId,
        incidentId: incident.id,
        reportedBy: caller.id,
        description: incident.description,
        urgent: body.urgent === true,
      });
      await this.examRequests.announceCreated(manager, exam);
    });
    return this.get(actor, id);
  }

  /**
   * Head Trainer của khu đóng sự cố kèm kết quả xử lý
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của sự cố
   * @param body Kết quả xử lý
   * @returns Promise trả về sự cố sau khi đóng
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc ngựa không thuộc khu người gọi
   * @throws NotFoundException Nếu không có sự cố
   * @throws ConflictException Nếu sự cố đã đóng, hoặc yêu cầu khám của sự cố còn chờ bác sĩ
   */
  async resolve(
    actor: Actor,
    id: string,
    body: ResolveIncidentDto,
  ): Promise<IncidentResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const incident = await this.lockIncident(manager, id);
      await this.access.assertHorseInTrainerBarn(
        manager,
        incident.horseId,
        caller.id,
      );
      assertIncidentOpen(incident.status);
      const exam = await manager.findOneBy(MedicalExamRequestEntity, {
        incidentId: incident.id,
      });
      assertIncidentResolvable(exam?.status ?? null);
      incident.status = IncidentStatus.RESOLVED;
      incident.resolution = body.resolution.trim();
      incident.resolvedBy = caller.id;
      incident.resolvedAt = new Date();
      await manager.save(incident);
    });
    return this.get(actor, id);
  }

  /**
   * Kiểm người gọi có vai trò xem mọi sự cố
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns true nếu người gọi là Club Manager hoặc Veterinarian
   */
  private seesAll(actor: Actor): boolean {
    return this.horseAccess.hasRole(
      actor,
      UserRole.CLUB_MANAGER,
      UserRole.VETERINARIAN,
    );
  }

  /**
   * Ghép link ảnh và yêu cầu khám vào các sự cố, đọc gộp một lượt
   *
   * @param manager EntityManager dùng để query
   * @param incidents Các sự cố đã load horse, reporter, resolver
   * @returns Promise trả về response theo đúng thứ tự đầu vào
   */
  private async toResponses(
    manager: EntityManager,
    incidents: IncidentEntity[],
  ): Promise<IncidentResponseDto[]> {
    if (incidents.length === 0) return [];
    const exams = await manager.findBy(MedicalExamRequestEntity, {
      incidentId: In(incidents.map((incident) => incident.id)),
    });
    const examByIncident = new Map(
      exams.map((exam) => [exam.incidentId, exam]),
    );
    const photoUrls = await this.media.signDownloadUrls(
      incidents.flatMap((incident) =>
        incident.mediaAssetId ? [incident.mediaAssetId] : [],
      ),
    );
    return incidents.map((incident) =>
      toIncidentResponse(
        incident,
        incident.mediaAssetId
          ? (photoUrls.get(incident.mediaAssetId) ?? null)
          : null,
        examByIncident.get(incident.id) ?? null,
      ),
    );
  }

  /**
   * Kiểm Groom được báo sự cố cho con ngựa: đang phụ trách ngựa và ngựa chưa chuyển nhượng hay mất
   *
   * @param manager EntityManager dùng để query
   * @param horse Con ngựa chưa xóa
   * @param callerId UUID của người gọi
   * @returns Promise hoàn tất khi được báo
   * @throws ForbiddenException Nếu ngựa không do người gọi phụ trách
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất
   */
  private async assertCanReport(
    manager: EntityManager,
    horse: HorseEntity,
    callerId: string,
  ): Promise<void> {
    if (
      !(await this.horseAccess.isGroomAssigned(horse.id, callerId, manager))
    ) {
      throw new ForbiddenException('Ngựa không do bạn phụ trách');
    }
    assertHorseLifecycleWritable(horse, 'INCIDENT');
  }

  /**
   * Kiểm người gọi được xem một sự cố
   *
   * @param manager EntityManager dùng để query
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param incident Sự cố cần xem
   * @returns Promise hoàn tất khi được xem
   * @throws ForbiddenException Nếu Head Trainer xem sự cố ngoài khu, hoặc Groom xem sự cố không do mình báo
   */
  private async assertCanView(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    incident: IncidentEntity,
  ): Promise<void> {
    if (this.seesAll(actor)) return;
    if (this.horseAccess.hasRole(actor, UserRole.HEAD_TRAINER)) {
      await this.access.assertHorseInTrainerBarn(
        manager,
        incident.horseId,
        callerId,
      );
      return;
    }
    if (incident.reportedBy !== callerId) {
      throw new ForbiddenException('Chỉ xem được sự cố bạn báo');
    }
  }

  /**
   * Khóa row sự cố để đổi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param id UUID của sự cố
   * @returns Promise trả về sự cố đã khóa
   * @throws NotFoundException Nếu không có sự cố
   */
  private async lockIncident(
    manager: EntityManager,
    id: string,
  ): Promise<IncidentEntity> {
    const incident = await manager.findOne(IncidentEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!incident) throw new NotFoundException(INCIDENT_NOT_FOUND);
    return incident;
  }
}
