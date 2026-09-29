import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Between, DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseMeasurementListQueryDto } from '../dto';
import type { CreateHorseMeasurementDto } from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseMeasurementAlert } from '../enums/horse-measurement-alert.enum';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../constants/horse.constants';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorseMeasurementsService } from './horse-measurements.service';

type Row = Record<string, unknown>;

const HORSE_ID = 'h1';
const CALLER_ID = 'user-1';
const anyDate: unknown = expect.any(Date);

describe('HorseMeasurementsService', () => {
  let horse: Partial<HorseEntity> & { id: string };
  let callerRole: UserRole;
  let barnRows: unknown[];
  let storedMeasurement: Row | null;
  let measurementRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let manager: {
    find: jest.Mock;
    findOne: jest.Mock;
    query: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    getRepository: jest.Mock;
  };
  let dataSource: { manager: typeof manager; transaction: jest.Mock };
  let horses: Record<string, jest.Mock>;
  let events: { publish: jest.Mock };
  let audit: { record: jest.Mock };
  let service: HorseMeasurementsService;

  const actorWith = (role: UserRole): Actor => {
    callerRole = role;
    return { sub: `kc-${role}`, roles: [role] };
  };

  const values = (
    items: Array<[HorseMeasurementType, number]>,
    confirmAbnormal = false,
  ): CreateHorseMeasurementDto => ({
    values: items.map(([type, value]) => ({ type, value })),
    confirmAbnormal,
  });

  beforeEach(() => {
    horse = {
      id: HORSE_ID,
      name: 'Gió',
      barnId: 'b1',
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      deletedAt: null,
    };
    callerRole = UserRole.VETERINARIAN;
    barnRows = [{ '?column?': 1 }];
    storedMeasurement = {
      id: 'm1',
      horseId: HORSE_ID,
      type: HorseMeasurementType.WEIGHT,
      value: '500.00',
      measuredAt: new Date('2026-09-20T00:00:00Z'),
      measuredBy: 'groom-1',
      source: HorseMeasurementSource.MANUAL,
    };
    measurementRepository = {
      create: jest.fn((row: Row) => row),
      save: jest.fn((row: Row) => Promise.resolve({ id: 'm-new', ...row })),
      findOneOrFail: jest.fn(() =>
        Promise.resolve({
          id: 'm-new',
          horseId: HORSE_ID,
          type: HorseMeasurementType.TEMPERATURE,
          value: '39.00',
          measuredAt: new Date(),
          measuredBy: CALLER_ID,
          measurer: { fullName: 'Bác sĩ A' },
          source: HorseMeasurementSource.MANUAL,
        }),
      ),
    };
    manager = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === UserEntity
            ? { id: CALLER_ID, status: UserStatus.ACTIVE, role: callerRole }
            : entity === HorseMeasurementEntity
              ? storedMeasurement
              : null,
        ),
      ),
      query: jest.fn(() => Promise.resolve(barnRows)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      getRepository: jest.fn(() => measurementRepository),
    };
    dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    horses = {
      lockHorseWithDeleted: jest.fn(() => Promise.resolve(horse)),
      isGroomAssigned: jest.fn().mockResolvedValue(false),
      isHorseInTrainerBarn: jest.fn(() => Promise.resolve(barnRows.length > 0)),
    };
    events = { publish: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const typedDataSource = dataSource as unknown as DataSource;
    const sharedRepository = horses as unknown as HorsesSharedRepository;
    service = new HorseMeasurementsService(
      {} as unknown as Repository<HorseMeasurementEntity>,
      sharedRepository,
      new HorseAccessService(typedDataSource, sharedRepository),
      typedDataSource,
      events as unknown as DomainEventPublisher,
      audit,
    );
  });

  describe('addMeasurements', () => {
    it('rejects a GROOM who is not assigned to the horse with 403', async () => {
      await expect(
        service.addMeasurements(
          actorWith(UserRole.GROOM),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(horses.isGroomAssigned).toHaveBeenCalledWith(
        HORSE_ID,
        CALLER_ID,
        manager,
      );
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('answers 403 before 409 to an unassigned GROOM on a TRANSFERRED horse (III.6.3)', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(
        service.addMeasurements(
          actorWith(UserRole.GROOM),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('lets an assigned GROOM record a measurement', async () => {
      horses.isGroomAssigned.mockResolvedValue(true);
      await service.addMeasurements(
        actorWith(UserRole.GROOM),
        HORSE_ID,
        values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
      );
      expect(measurementRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects a HEAD_TRAINER outside the barn with 403', async () => {
      barnRows = [];
      await expect(
        service.addMeasurements(
          actorWith(UserRole.HEAD_TRAINER),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(horses.isHorseInTrainerBarn).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        CALLER_ID,
      );
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a CLUB_MANAGER with 403', async () => {
      await expect(
        service.addMeasurements(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a repeated measurement type with 400', async () => {
      await expect(
        service.addMeasurements(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          values([
            [HorseMeasurementType.TEMPERATURE, 37.8],
            [HorseMeasurementType.TEMPERATURE, 37.9],
          ]),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('rejects an abnormal value without confirmAbnormal with 422 and saves nothing', async () => {
      const result = service.addMeasurements(
        actorWith(UserRole.VETERINARIAN),
        HORSE_ID,
        values([
          [HorseMeasurementType.HEIGHT, 160],
          [HorseMeasurementType.TEMPERATURE, 39],
        ]),
      );
      await expect(result).rejects.toThrow(UnprocessableEntityException);
      await expect(result).rejects.toThrow(/TEMPERATURE/);
      expect(measurementRepository.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('saves a confirmed abnormal value as MANUAL, audits it and publishes the fever alert', async () => {
      const result = await service.addMeasurements(
        actorWith(UserRole.VETERINARIAN),
        HORSE_ID,
        values([[HorseMeasurementType.TEMPERATURE, 39]], true),
      );
      expect(measurementRepository.save).toHaveBeenCalledWith({
        horseId: HORSE_ID,
        type: HorseMeasurementType.TEMPERATURE,
        value: '39.00',
        measuredAt: anyDate,
        isAbnormal: true,
        measuredBy: CALLER_ID,
        source: HorseMeasurementSource.MANUAL,
        medicalRecordId: null,
      });
      expect(audit.record).toHaveBeenCalledWith(manager, {
        actorId: CALLER_ID,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.HORSE_MEASUREMENT,
        entityId: 'm-new',
        before: null,
        after: {
          horseId: HORSE_ID,
          type: HorseMeasurementType.TEMPERATURE,
          value: '39.00',
          measuredAt: anyDate,
          source: HorseMeasurementSource.MANUAL,
          isAbnormal: true,
          abnormalConfirmed: true,
        },
        feature: 'F1.5',
      });
      expect(events.publish).toHaveBeenCalledWith(
        HORSE_MEASUREMENT_ALERT_EVENT,
        expect.objectContaining({
          alert: HorseMeasurementAlert.FEVER,
          horseId: HORSE_ID,
          measurementId: 'm-new',
          source: HorseMeasurementSource.MANUAL,
        }),
      );
      expect(result[0].alerts).toEqual([
        expect.objectContaining({ alert: HorseMeasurementAlert.FEVER }),
      ]);
    });

    it('stores a value inside the normal range as not abnormal', async () => {
      await service.addMeasurements(
        actorWith(UserRole.VETERINARIAN),
        HORSE_ID,
        values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
      );
      expect(measurementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isAbnormal: false }),
      );
    });

    it('rejects a TRANSFERRED horse with 409', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(
        service.addMeasurements(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(ConflictException);
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('returns 404 when the horse is missing', async () => {
      horses.lockHorseWithDeleted.mockResolvedValue(null);
      await expect(
        service.addMeasurements(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleted profile', () => {
    const DELETED_MESSAGE =
      'Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác';
    const managerVet = (): Actor => ({
      sub: 'kc-cm-vet',
      roles: [UserRole.CLUB_MANAGER, UserRole.VETERINARIAN],
    });

    beforeEach(() => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
    });

    it('returns 404 to a VETERINARIAN adding measurements', async () => {
      await expect(
        service.addMeasurements(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(NotFoundException);
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a caller holding CLUB_MANAGER adding measurements with 403', async () => {
      await expect(
        service.addMeasurements(
          managerVet(),
          HORSE_ID,
          values([[HorseMeasurementType.TEMPERATURE, 37.8]]),
        ),
      ).rejects.toThrow(new ForbiddenException(DELETED_MESSAGE));
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a caller holding CLUB_MANAGER deleting a measurement with 403', async () => {
      await expect(
        service.deleteMeasurement(managerVet(), HORSE_ID, 'm1', {
          reason: 'Nhập sai',
        }),
      ).rejects.toThrow(new ForbiddenException(DELETED_MESSAGE));
      expect(manager.softDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('deleteMeasurement', () => {
    const reason = { reason: 'Nhập sai' };

    it('rejects a record that came from a medical exam with 409', async () => {
      storedMeasurement = {
        ...storedMeasurement,
        source: HorseMeasurementSource.MEDICAL_EXAM,
      };
      await expect(
        service.deleteMeasurement(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          'm1',
          reason,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Bản ghi đến từ buổi khám, cần xử lý ở hồ sơ y tế',
        ),
      );
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.softDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('returns 404 when the record does not belong to the horse', async () => {
      storedMeasurement = null;
      await expect(
        service.deleteMeasurement(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          'm1',
          reason,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a TRANSFERRED horse with 409', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(
        service.deleteMeasurement(
          actorWith(UserRole.VETERINARIAN),
          HORSE_ID,
          'm1',
          reason,
        ),
      ).rejects.toThrow(ConflictException);
      expect(manager.softDelete).not.toHaveBeenCalled();
    });

    it('locks the record, stores deleteReason and deletedBy, soft-deletes and audits the reason', async () => {
      await service.deleteMeasurement(
        actorWith(UserRole.VETERINARIAN),
        HORSE_ID,
        'm1',
        reason,
      );
      expect(manager.findOne).toHaveBeenCalledWith(HorseMeasurementEntity, {
        where: { id: 'm1', horseId: HORSE_ID },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(
        HorseMeasurementEntity,
        { id: 'm1' },
        { deleteReason: 'Nhập sai', deletedBy: CALLER_ID },
      );
      expect(manager.softDelete).toHaveBeenCalledWith(HorseMeasurementEntity, {
        id: 'm1',
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: CALLER_ID,
          action: AuditAction.DELETE,
          entityType: AuditEntityType.HORSE_MEASUREMENT,
          entityId: 'm1',
          after: null,
          reason: 'Nhập sai',
        }),
      );
    });
  });

  describe('recordExamMeasurements', () => {
    const examInput = (confirmAbnormal = true) => ({
      horseId: HORSE_ID,
      medicalRecordId: 'visit-1',
      measuredBy: CALLER_ID,
      measuredAt: new Date(),
      values: [{ type: HorseMeasurementType.TEMPERATURE, value: 39 }],
      confirmAbnormal,
      feature: 'F3.3',
    });

    it('saves exam values as MEDICAL_EXAM with the visit id and returns alerts without publishing', async () => {
      const alerts = await service.recordExamMeasurements(
        manager as never,
        examInput(),
      );
      expect(measurementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          source: HorseMeasurementSource.MEDICAL_EXAM,
          medicalRecordId: 'visit-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          feature: 'F3.3',
          after: expect.objectContaining({
            source: HorseMeasurementSource.MEDICAL_EXAM,
            medicalRecordId: 'visit-1',
          }) as unknown,
        }),
      );
      expect(alerts).toEqual([
        expect.objectContaining({
          alert: HorseMeasurementAlert.FEVER,
          source: HorseMeasurementSource.MEDICAL_EXAM,
        }),
      ]);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('stores the abnormal flag of an exam value and audits the confirmation', async () => {
      await service.recordExamMeasurements(manager as never, examInput());

      expect(measurementRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isAbnormal: true }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          after: expect.objectContaining({
            isAbnormal: true,
            abnormalConfirmed: true,
          }) as unknown,
        }),
      );
    });

    it('rejects an unconfirmed abnormal exam value with 422 and saves nothing', async () => {
      await expect(
        service.recordExamMeasurements(manager as never, examInput(false)),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });

    it('does nothing when the visit has no measurement', async () => {
      await expect(
        service.recordExamMeasurements(manager as never, {
          ...examInput(),
          values: [],
        }),
      ).resolves.toEqual([]);
      expect(measurementRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('voidExamMeasurements', () => {
    it('soft-deletes every measurement of the voided visit with the reason and audits each', async () => {
      manager.find.mockResolvedValue([
        { ...storedMeasurement, id: 'm1', medicalRecordId: 'visit-1' },
        { ...storedMeasurement, id: 'm2', medicalRecordId: 'visit-1' },
      ]);

      const count = await service.voidExamMeasurements(manager as never, {
        medicalRecordId: 'visit-1',
        reason: 'Gõ nhầm cân nặng',
        actorId: CALLER_ID,
        feature: 'F3.6',
      });

      expect(count).toBe(2);
      expect(manager.find).toHaveBeenCalledWith(HorseMeasurementEntity, {
        where: { medicalRecordId: 'visit-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(
        HorseMeasurementEntity,
        { id: 'm1' },
        { deleteReason: 'Gõ nhầm cân nặng', deletedBy: CALLER_ID },
      );
      expect(manager.softDelete).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.DELETE,
          reason: 'Gõ nhầm cân nặng',
          feature: 'F3.6',
        }),
      );
    });
  });
});

describe('HorseMeasurementsService.listMeasurements', () => {
  const owner: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };
  let repository: { findAndCount: jest.Mock };
  let access: { findReadable: jest.Mock };
  let service: HorseMeasurementsService;

  const query = (patch: Partial<HorseMeasurementListQueryDto> = {}) =>
    Object.assign(new HorseMeasurementListQueryDto(), patch);

  beforeEach(() => {
    repository = { findAndCount: jest.fn().mockResolvedValue([[], 45]) };
    access = { findReadable: jest.fn().mockResolvedValue({ id: 'h1' }) };
    service = new HorseMeasurementsService(
      repository as unknown as Repository<HorseMeasurementEntity>,
      {} as HorsesSharedRepository,
      access as unknown as HorseAccessService,
      {} as DataSource,
      {} as DomainEventPublisher,
      { record: jest.fn() },
    );
  });

  it('filters by type and time range and pages newest first', async () => {
    const page = await service.listMeasurements(
      owner,
      'h1',
      query({
        type: HorseMeasurementType.WEIGHT,
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-09-29T00:00:00.000Z',
        page: 2,
        limit: 20,
      }),
    );

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          horseId: 'h1',
          type: HorseMeasurementType.WEIGHT,
          measuredAt: Between(
            new Date('2026-06-01T00:00:00.000Z'),
            new Date('2026-09-29T00:00:00.000Z'),
          ),
        },
        order: { measuredAt: 'DESC' },
        skip: 20,
        take: 20,
      }),
    );
    expect(page.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
  });

  it('uses an open-ended range when only from is given', async () => {
    await service.listMeasurements(
      owner,
      'h1',
      query({ from: '2026-06-01T00:00:00.000Z' }),
    );

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          horseId: 'h1',
          measuredAt: MoreThanOrEqual(new Date('2026-06-01T00:00:00.000Z')),
        },
      }),
    );
  });

  it('rejects from after to with 400 before reading anything', async () => {
    await expect(
      service.listMeasurements(
        owner,
        'h1',
        query({
          from: '2026-09-29T00:00:00.000Z',
          to: '2026-06-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.findAndCount).not.toHaveBeenCalled();
  });

  it('answers 404 for a horse outside the caller scope', async () => {
    access.findReadable.mockRejectedValue(new NotFoundException());
    await expect(
      service.listMeasurements(owner, 'h1', query()),
    ).rejects.toThrow(NotFoundException);
    expect(repository.findAndCount).not.toHaveBeenCalled();
  });
});
