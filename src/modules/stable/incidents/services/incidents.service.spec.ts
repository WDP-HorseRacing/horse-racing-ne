import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../../common/enums/role.enum';
import type { DomainEventPublisher } from '../../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../../common/types/actor';
import { AuditAction } from '../../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../../audit/constants/audit-feature.enum';
import type { AuditService } from '../../../audit/services/audit.service';
import { HorseAccessService } from '../../../horses/shared/horse-access.service';
import { HorseLifecycleStatus } from '../../../horses/enums/horse-status.enum';
import { ExamRequestStatus } from '../../../medical/constant/exam-request.enum';
import { MedicalExamRequestEntity } from '../../../medical/entity/medical-exam-request.entity';
import type {
  ExamRequestHandledEvent,
  ExamRequestReopenedEvent,
} from '../../../medical/types/medical-events.types';
import { MediaService } from '../../../media/services/media.service';
import { IncidentStatus } from '../../constants/incident-status.enum';
import {
  INCIDENT_HANDLED_EVENT,
  INCIDENT_REPORTED_EVENT,
} from '../../constants/stable-events.constants';
import { IncidentResolutionSource } from '../../enums/incident-resolution-source.enum';
import {
  IncidentListQueryDto,
  ReportIncidentDto,
} from '../../dto/incident.dto';
import { GroomAssignmentEntity } from '../../entities/groom-assignment.entity';
import { IncidentEntity } from '../../entities/incident.entity';
import { StableAccessService } from '../../shared/stable-access.service';
import { ExamRequestsService } from '../../../medical/exam-request/exam-requests.service';
import { IncidentsService } from './incidents.service';

jest.mock('../../../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({ id: 'user-1' }),
}));

describe('IncidentsService', () => {
  const caller = { id: 'user-1' };
  const groom: Actor = { sub: 'kc-groom', roles: [UserRole.GROOM] };
  const headTrainer: Actor = {
    sub: 'kc-trainer',
    roles: [UserRole.HEAD_TRAINER],
  };
  const clubManager: Actor = {
    sub: 'kc-manager',
    roles: [UserRole.CLUB_MANAGER],
  };
  const horse = {
    id: 'horse-1',
    name: 'Mây',
    barnId: 'barn-1',
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
  };

  let manager: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let queryBuilder: Record<string, jest.Mock>;
  let incidentsRepository: { createQueryBuilder: jest.Mock };
  let incident: Record<string, any>;
  let assignment: Record<string, any> | null;
  let examRequest: Record<string, any> | null;
  let examRows: Record<string, any>[];
  let access: {
    lockOperableHorse: jest.Mock;
    assertHorseInTrainerBarn: jest.Mock;
  };
  let horseAccess: {
    hasRole: jest.Mock;
    findWritableHorse: jest.Mock;
    lockWritableHorse: jest.Mock;
    isGroomAssigned: jest.Mock;
  };
  let media: {
    assertAttachableIncidentPhoto: jest.Mock;
    signDownloadUrls: jest.Mock;
  };
  let examRequests: {
    createFromIncident: jest.Mock;
    announceCreated: jest.Mock;
  };
  let events: { publish: jest.Mock };
  let audit: { record: jest.Mock };
  let service: IncidentsService;

  beforeEach(() => {
    incident = {
      id: 'incident-1',
      horseId: horse.id,
      horse,
      reportedBy: caller.id,
      reporter: { id: caller.id, fullName: 'Groom Một' },
      description: 'Ngựa bị đau chân',
      mediaAssetId: 'photo-1',
      status: IncidentStatus.OPEN,
      resolution: null,
      resolvedBy: null,
      resolver: null,
      resolvedAt: null,
      resolutionSource: null,
      createdAt: new Date('2026-11-08T00:00:00.000Z'),
    };
    assignment = { groomId: 'groom-2' };
    examRequest = null;
    examRows = [];

    queryBuilder = {};
    for (const method of [
      'withDeleted',
      'innerJoinAndSelect',
      'leftJoinAndSelect',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
      'andWhere',
      'innerJoin',
    ]) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.getManyAndCount = jest.fn().mockResolvedValue([[incident], 1]);

    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === MedicalExamRequestEntity ? examRequest : incident,
        ),
      ),
      findOneBy: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === GroomAssignmentEntity ? assignment : incident,
        ),
      ),
      findBy: jest.fn().mockImplementation(() => Promise.resolve(examRows)),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity: unknown, row: object) => row),
      save: jest.fn((row: Record<string, any>) => {
        if (!row.id) {
          Object.assign(incident, row, {
            id: 'incident-created',
            horse,
            reporter: { id: caller.id, fullName: 'Groom Một' },
          });
        }
        return Promise.resolve(incident);
      }),
    };
    transaction = jest.fn(
      (work: (entityManager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    );
    incidentsRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    access = {
      lockOperableHorse: jest.fn().mockResolvedValue(horse),
      assertHorseInTrainerBarn: jest.fn().mockResolvedValue(undefined),
    };
    horseAccess = {
      hasRole: jest.fn((actor: Actor, ...roles: UserRole[]) =>
        actor.roles.some((role) => roles.includes(role)),
      ),
      findWritableHorse: jest.fn().mockResolvedValue(horse),
      lockWritableHorse: jest.fn().mockResolvedValue(horse),
      isGroomAssigned: jest.fn().mockResolvedValue(false),
    };
    media = {
      assertAttachableIncidentPhoto: jest.fn().mockResolvedValue(undefined),
      signDownloadUrls: jest
        .fn()
        .mockResolvedValue(new Map([['photo-1', 'https://media/photo-1']])),
    };
    examRequests = {
      createFromIncident: jest.fn().mockResolvedValue({
        id: 'exam-1',
        incidentId: incident.id,
        status: ExamRequestStatus.PENDING,
        urgent: true,
      }),
      announceCreated: jest.fn().mockResolvedValue(undefined),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const dataSource = { manager, transaction } as unknown as DataSource;
    service = new IncidentsService(
      incidentsRepository as unknown as Repository<IncidentEntity>,
      access as unknown as StableAccessService,
      horseAccess as unknown as HorseAccessService,
      media as unknown as MediaService,
      examRequests as unknown as ExamRequestsService,
      events as unknown as DomainEventPublisher,
      dataSource,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('applies filters, pagination and loads the response details', async () => {
      const query = Object.assign(new IncidentListQueryDto(), {
        page: 2,
        limit: 5,
        status: IncidentStatus.OPEN,
        horseId: horse.id,
        barnId: horse.barnId,
      });

      const result = await service.list(clubManager, query);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'incident.status = :status',
        { status: IncidentStatus.OPEN },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'incident.horseId = :horseId',
        { horseId: horse.id },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'horse.barnId = :barnId',
        { barnId: horse.barnId },
      );
      expect(queryBuilder.skip).toHaveBeenCalledWith(5);
      expect(queryBuilder.take).toHaveBeenCalledWith(5);
      expect(result).toMatchObject({
        items: [{ id: incident.id, photoUrl: 'https://media/photo-1' }],
        meta: { total: 1, page: 2, limit: 5, totalPages: 1 },
      });
    });

    it('limits Head Trainer results to horses in the trainer barn', async () => {
      await service.list(headTrainer, new IncidentListQueryDto());

      expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
        'horse.barn',
        'scopeBarn',
        'scopeBarn.deletedAt IS NULL AND scopeBarn.headTrainerId = :callerId',
        { callerId: caller.id },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'horse.deletedAt IS NULL',
      );
    });
  });

  describe('get', () => {
    it('returns a mapped incident with its signed photo and related exam request', async () => {
      examRows = [
        {
          id: 'exam-1',
          incidentId: incident.id,
          status: ExamRequestStatus.PENDING,
          urgent: true,
          handledAt: null,
          dismissReason: null,
        },
      ];

      await expect(service.get(groom, incident.id)).resolves.toMatchObject({
        id: incident.id,
        horseName: horse.name,
        description: incident.description,
        photoUrl: 'https://media/photo-1',
        urgent: true,
        examRequest: { id: 'exam-1', status: ExamRequestStatus.PENDING },
      });
      expect(media.signDownloadUrls).toHaveBeenCalledWith(['photo-1']);
    });

    it('rejects a Groom who neither reported nor is assigned to the horse', async () => {
      incident.reportedBy = 'another-user';
      horseAccess.isGroomAssigned.mockResolvedValue(false);

      await expect(service.get(groom, incident.id)).rejects.toThrow(
        new ForbiddenException(
          'Chỉ xem được sự cố bạn báo hoặc của ngựa bạn đang phụ trách',
        ),
      );
    });

    it('returns not found when the incident does not exist', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.get(groom, 'missing')).rejects.toThrow(
        new NotFoundException('Không tìm thấy sự cố'),
      );
    });
  });

  describe('report', () => {
    const body: ReportIncidentDto = {
      horseId: horse.id,
      description: '  Ngựa bị đau chân  ',
      photoMediaId: 'photo-1',
    };

    it('trims the description, validates the photo and publishes the report event', async () => {
      await service.report(groom, body);

      expect(media.assertAttachableIncidentPhoto).toHaveBeenCalledWith(
        caller.id,
        'photo-1',
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          horseId: horse.id,
          reportedBy: caller.id,
          description: 'Ngựa bị đau chân',
          mediaAssetId: 'photo-1',
          status: IncidentStatus.OPEN,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        INCIDENT_REPORTED_EVENT,
        expect.objectContaining({
          horseId: horse.id,
          urgent: false,
          description: 'Ngựa bị đau chân',
          assignedGroomId: 'groom-2',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: AuditEntityType.INCIDENT,
          feature: AuditFeature.INCIDENT,
        }),
      );
    });

    it('creates and announces an exam request for an urgent report', async () => {
      await service.report(groom, { ...body, urgent: true });

      expect(examRequests.createFromIncident).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          horseId: horse.id,
          reportedBy: caller.id,
          description: 'Ngựa bị đau chân',
          urgent: true,
        }),
      );
      expect(examRequests.announceCreated).toHaveBeenCalled();
    });
  });

  describe('refer', () => {
    it('creates an exam request and emits the handled event', async () => {
      await service.refer(headTrainer, incident.id, { urgent: true });

      expect(access.lockOperableHorse).toHaveBeenCalledWith(
        manager,
        caller.id,
        incident.horseId,
        'INCIDENT',
      );
      expect(examRequests.createFromIncident).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          incidentId: incident.id,
          urgent: true,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        INCIDENT_HANDLED_EVENT,
        expect.objectContaining({
          incidentId: incident.id,
          action: 'REFERRED',
          resolution: null,
        }),
      );
    });

    it('rejects an incident that already has an exam request', async () => {
      manager.exists.mockResolvedValue(true);

      await expect(service.refer(headTrainer, incident.id, {})).rejects.toThrow(
        new ConflictException('Sự cố đã được chuyển bác sĩ'),
      );
      expect(examRequests.createFromIncident).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('trims the resolution, closes the incident and publishes the result', async () => {
      await service.resolve(headTrainer, incident.id, {
        resolution: '  Đã vệ sinh vết thương  ',
      });

      expect(incident).toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolution: 'Đã vệ sinh vết thương',
        resolvedBy: caller.id,
        resolutionSource: IncidentResolutionSource.HEAD_TRAINER,
      });
      expect(manager.findOne).toHaveBeenCalledWith(MedicalExamRequestEntity, {
        where: { incidentId: incident.id },
        lock: { mode: 'pessimistic_read' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          reason: 'Đã vệ sinh vết thương',
          feature: AuditFeature.INCIDENT,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        INCIDENT_HANDLED_EVENT,
        expect.objectContaining({
          action: 'RESOLVED',
          resolution: 'Đã vệ sinh vết thương',
        }),
      );
    });

    it('does not close an incident while its exam request is pending', async () => {
      examRequest = { status: ExamRequestStatus.PENDING };

      await expect(
        service.resolve(headTrainer, incident.id, { resolution: 'Đã xử lý' }),
      ).rejects.toThrow(
        new ConflictException(
          'Sự cố đang chờ bác sĩ khám, sẽ tự đóng khi bác sĩ xử lý xong',
        ),
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('resolveFromExam', () => {
    const event: ExamRequestHandledEvent = {
      eventId: 'event-1',
      horseId: horse.id,
      requestId: 'exam-1',
      requestedBy: null,
      incidentId: incident.id,
      outcome: ExamRequestStatus.EXAMINED,
      description: incident.description,
      dismissReason: null,
      handledBy: 'vet-1',
      handledAt: '2026-11-08T01:00:00.000Z',
    };

    it('closes the incident when the current exam outcome matches the event', async () => {
      examRequest = {
        status: ExamRequestStatus.EXAMINED,
        handledAt: new Date(event.handledAt),
      };

      await service.resolveFromExam(event);

      expect(incident).toMatchObject({
        status: IncidentStatus.RESOLVED,
        resolutionSource: IncidentResolutionSource.EXAM,
        resolution: 'Bác sĩ đã khám',
        resolvedBy: 'vet-1',
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ actorId: 'vet-1' }),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('ignores events for incidents that are not open', async () => {
      incident.status = IncidentStatus.RESOLVED;
      examRequest = {
        status: ExamRequestStatus.EXAMINED,
        handledAt: new Date(event.handledAt),
      };

      await service.resolveFromExam(event);

      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('reopenFromExam', () => {
    const event: ExamRequestReopenedEvent = {
      eventId: 'event-2',
      horseId: horse.id,
      requestId: 'exam-1',
      incidentId: incident.id,
      reopenedBy: 'vet-1',
      reason: 'Buổi khám đã hủy',
    };

    it('reopens an exam-resolved incident when its request is pending again', async () => {
      incident.status = IncidentStatus.RESOLVED;
      incident.resolution = 'Bác sĩ đã khám';
      incident.resolvedBy = 'vet-1';
      incident.resolutionSource = IncidentResolutionSource.EXAM;
      examRequest = { status: ExamRequestStatus.PENDING };

      await service.reopenFromExam(event);

      expect(incident).toMatchObject({
        status: IncidentStatus.OPEN,
        resolution: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionSource: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: 'vet-1',
          reason: event.reason,
          after: { status: IncidentStatus.OPEN },
        }),
      );
    });

    it('does nothing when the incident was not resolved by an exam', async () => {
      incident.resolutionSource = IncidentResolutionSource.HEAD_TRAINER;

      await service.reopenFromExam(event);

      expect(manager.findOne).toHaveBeenCalledTimes(1);
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
