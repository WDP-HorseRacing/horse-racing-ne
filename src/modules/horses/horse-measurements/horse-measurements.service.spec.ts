import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import type { Actor } from '../../../common/types/actor';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../constants/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../constants/horse.constants';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorseMeasurementsRepository } from './horse-measurements.repository';
import { HorseMeasurementsService } from './horse-measurements.service';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('HorseMeasurementsService.addMeasurement', () => {
  const horse = Object.assign(new HorseEntity(), {
    id: 'h1',
    isReference: false,
    healthStatus: HorseHealthStatus.ELIGIBLE,
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    deletedAt: null,
  });
  const body = { type: HorseMeasurementType.WEIGHT, value: 480 };
  const saved = (measurer: string) => ({
    id: 'm1',
    horseId: 'h1',
    measuredBy: 'user-1',
    measurer: { fullName: measurer },
    type: HorseMeasurementType.WEIGHT,
    value: '480.00',
    measuredAt: new Date(),
  });
  let repository: Record<string, jest.Mock>;
  let query: jest.Mock;
  let publish: jest.Mock;
  let record: jest.Mock;
  let tx: { findOne: jest.Mock; softDelete: jest.Mock };
  let service: HorseMeasurementsService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(horse),
      isVisible: jest.fn().mockResolvedValue(true),
      isGroomAssigned: jest.fn().mockResolvedValue(false),
      addMeasurement: jest.fn(),
      maxWeightBetween: jest.fn().mockResolvedValue(null),
    };
    publish = jest.fn();
    record = jest.fn().mockResolvedValue(undefined);
    tx = { findOne: jest.fn(), softDelete: jest.fn() };
    query = jest.fn().mockResolvedValue([]);
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
        query,
      },
      transaction: jest.fn((work: (manager: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as DataSource;
    const shared = repository as unknown as HorsesSharedRepository;
    service = new HorseMeasurementsService(
      repository as unknown as HorseMeasurementsRepository,
      shared,
      new HorseAccessService(dataSource, shared),
      dataSource,
      { publish } as unknown as DomainEventPublisher,
      { record },
    );
  });

  it('forbids a groom from recording on a horse not assigned to them', async () => {
    await expect(
      service.addMeasurement(actorWith(UserRole.GROOM), 'h1', body),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.isGroomAssigned).toHaveBeenCalledWith('h1', 'user-1');
    expect(repository.addMeasurement).not.toHaveBeenCalled();
  });

  it('lets a groom record on an assigned horse', async () => {
    repository.isGroomAssigned.mockResolvedValue(true);
    repository.addMeasurement.mockResolvedValue(saved('Trần B'));
    await service.addMeasurement(actorWith(UserRole.GROOM), 'h1', body);
    expect(repository.addMeasurement).toHaveBeenCalled();
  });

  it('forbids a groom from recording a type outside their list', async () => {
    repository.isGroomAssigned.mockResolvedValue(true);
    await expect(
      service.addMeasurement(actorWith(UserRole.GROOM), 'h1', {
        type: HorseMeasurementType.BODY_CONDITION,
        value: 5,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.addMeasurement).not.toHaveBeenCalled();
  });

  it('forbids a head trainer from recording temperature inside their barn', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(
      service.addMeasurement(actorWith(UserRole.HEAD_TRAINER), 'h1', {
        type: HorseMeasurementType.TEMPERATURE,
        value: 38,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.addMeasurement).not.toHaveBeenCalled();
  });

  it('lets a head trainer record body condition inside their barn', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    repository.addMeasurement.mockResolvedValue(saved('Phạm D'));
    await service.addMeasurement(actorWith(UserRole.HEAD_TRAINER), 'h1', {
      type: HorseMeasurementType.BODY_CONDITION,
      value: 5,
    });
    expect(repository.addMeasurement).toHaveBeenCalled();
  });

  it('rejects a measured time more than 7 days back', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await expect(
      service.addMeasurement(actorWith(UserRole.VETERINARIAN), 'h1', {
        ...body,
        measuredAt: eightDaysAgo.toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.addMeasurement).not.toHaveBeenCalled();
  });

  it('does not check groom assignments for a veterinarian', async () => {
    repository.addMeasurement.mockResolvedValue(saved('Lê C'));
    await service.addMeasurement(actorWith(UserRole.VETERINARIAN), 'h1', body);
    expect(repository.isGroomAssigned).not.toHaveBeenCalled();
  });

  it('publishes an urgent fever alert after saving a temperature above 38.6', async () => {
    repository.addMeasurement.mockImplementation(() => {
      expect(publish).not.toHaveBeenCalled();
      return Promise.resolve({
        ...saved('Lê C'),
        type: HorseMeasurementType.TEMPERATURE,
        value: '38.70',
      });
    });
    const result = await service.addMeasurement(
      actorWith(UserRole.VETERINARIAN),
      'h1',
      { type: HorseMeasurementType.TEMPERATURE, value: 38.7 },
    );
    expect(result.alerts).toEqual([
      {
        alert: HorseMeasurementAlert.FEVER,
        severity: HorseMeasurementAlertSeverity.URGENT,
        baselineValue: null,
        dropPercent: null,
      },
    ]);
    expect(publish).toHaveBeenCalledWith(
      HORSE_MEASUREMENT_ALERT_EVENT,
      expect.objectContaining({
        alert: HorseMeasurementAlert.FEVER,
        measurementId: 'm1',
        horseId: 'h1',
        value: 38.7,
      }),
    );
  });

  it('warns on a weight drop over 5% against the 14-day peak', async () => {
    repository.maxWeightBetween.mockResolvedValue(500);
    repository.addMeasurement.mockResolvedValue({
      ...saved('Lê C'),
      value: '470.00',
    });
    const measuredAt = new Date(Date.now() - 60_000);
    const result = await service.addMeasurement(
      actorWith(UserRole.VETERINARIAN),
      'h1',
      { ...body, value: 470, measuredAt: measuredAt.toISOString() },
    );
    const [, from, to] = repository.maxWeightBetween.mock.calls[0] as [
      string,
      Date,
      Date,
    ];
    expect(to).toEqual(measuredAt);
    expect(to.getTime() - from.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(result.alerts[0]).toMatchObject({
      alert: HorseMeasurementAlert.WEIGHT_DROP,
      baselineValue: 500,
      dropPercent: 6,
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing for a normal reading', async () => {
    repository.maxWeightBetween.mockResolvedValue(490);
    repository.addMeasurement.mockResolvedValue(saved('Lê C'));
    const result = await service.addMeasurement(
      actorWith(UserRole.VETERINARIAN),
      'h1',
      body,
    );
    expect(result.alerts).toEqual([]);
    expect(publish).not.toHaveBeenCalled();
  });

  describe('deleteMeasurement', () => {
    const stored = (measuredBy: string) => ({
      id: 'm1',
      horseId: 'h1',
      measuredBy,
      type: HorseMeasurementType.TEMPERATURE,
      value: '39.00',
      measuredAt: new Date('2026-09-19T08:00:00Z'),
    });

    it('lets the recorder soft-delete it and writes an audit log', async () => {
      repository.isGroomAssigned.mockResolvedValue(true);
      tx.findOne.mockResolvedValue(stored('user-1'));
      await service.deleteMeasurement(actorWith(UserRole.GROOM), 'h1', 'm1');
      expect(tx.findOne).toHaveBeenCalledWith(HorseMeasurementEntity, {
        where: { id: 'm1', horseId: 'h1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(tx.softDelete).toHaveBeenCalledWith(HorseMeasurementEntity, {
        id: 'm1',
      });
      expect(record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          actorId: 'user-1',
          action: AuditAction.DELETE,
          entityType: AuditEntityType.HORSE_MEASUREMENT,
          entityId: 'm1',
          after: null,
        }),
      );
    });

    it('forbids deleting a record made by someone else', async () => {
      tx.findOne.mockResolvedValue(stored('user-2'));
      await expect(
        service.deleteMeasurement(actorWith(UserRole.VETERINARIAN), 'h1', 'm1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.softDelete).not.toHaveBeenCalled();
    });

    it('forbids the recorder once they can no longer record that type', async () => {
      tx.findOne.mockResolvedValue(stored('user-1'));
      await expect(
        service.deleteMeasurement(actorWith(UserRole.GROOM), 'h1', 'm1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.softDelete).not.toHaveBeenCalled();
    });

    it('returns not found for a missing or already deleted record', async () => {
      tx.findOne.mockResolvedValue(null);
      await expect(
        service.deleteMeasurement(actorWith(UserRole.VETERINARIAN), 'h1', 'm1'),
      ).rejects.toThrow(NotFoundException);
      expect(record).not.toHaveBeenCalled();
    });
  });
});
