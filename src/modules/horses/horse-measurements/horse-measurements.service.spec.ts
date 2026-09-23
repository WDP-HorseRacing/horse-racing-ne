import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { UserEntity } from '../../users/entities/user.entity';
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
        },
        feature: 'F1.5',
      });
      expect(events.publish).toHaveBeenCalledWith(
        HORSE_MEASUREMENT_ALERT_EVENT,
        expect.objectContaining({
          alert: HorseMeasurementAlert.FEVER,
          horseId: HORSE_ID,
          measurementId: 'm-new',
        }),
      );
      expect(result[0].alerts).toEqual([
        expect.objectContaining({ alert: HorseMeasurementAlert.FEVER }),
      ]);
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
});
