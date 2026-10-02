import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseHealthService } from '../../horses/shared/horse-health.service';
import { MEDICAL_HEALTH_CHANGED_EVENT } from '../constants/medical-events.constants';
import { MedicalAccessService } from '../shared/medical-access.service';
import { HealthStatusesRepository } from './health-statuses.repository';
import { HealthStatusesService } from './health-statuses.service';

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };

describe('HealthStatusesService', () => {
  let access: { lockHorseForWrite: jest.Mock };
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let horseHealth: { applyHealthStatus: jest.Mock };
  let repository: { history: jest.Mock };
  let events: { publish: jest.Mock };
  let service: HealthStatusesService;

  beforeEach(() => {
    const manager = {};
    access = {
      lockHorseForWrite: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1', healthStatus: HorseHealthStatus.ELIGIBLE },
      }),
    };
    horseAccess = { findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }) };
    horseHealth = {
      applyHealthStatus: jest.fn(
        (_m: unknown, input: { to: HorseHealthStatus }) =>
          Promise.resolve({
            changed: input.to !== HorseHealthStatus.ELIGIBLE,
            from: HorseHealthStatus.ELIGIBLE,
            to: input.to,
          }),
      ),
    };
    repository = { history: jest.fn().mockResolvedValue([]) };
    events = { publish: jest.fn() };
    service = new HealthStatusesService(
      {
        transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
      } as unknown as DataSource,
      access as unknown as MedicalAccessService,
      horseAccess as unknown as HorseAccessService,
      horseHealth as unknown as HorseHealthService,
      repository as unknown as HealthStatusesRepository,
      events as unknown as DomainEventPublisher,
    );
  });

  it('requires a reason before writing', async () => {
    await expect(
      service.updateHealth(vet, 'h1', {
        healthStatus: HorseHealthStatus.INJURED,
        reason: ' ',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(horseHealth.applyHealthStatus).not.toHaveBeenCalled();
  });

  it('propagates conflict for a transferred horse', async () => {
    access.lockHorseForWrite.mockRejectedValue(new ConflictException());
    await expect(
      service.updateHealth(vet, 'h1', {
        healthStatus: HorseHealthStatus.INJURED,
        reason: 'Viêm gân',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('propagates not found for a horse outside the caller scope', async () => {
    access.lockHorseForWrite.mockRejectedValue(new NotFoundException());
    await expect(
      service.updateHealth(vet, 'h9', {
        healthStatus: HorseHealthStatus.INJURED,
        reason: 'Viêm gân',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(horseHealth.applyHealthStatus).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('writes the new status with feature F3.7 and publishes after commit', async () => {
    const result = await service.updateHealth(vet, 'h1', {
      healthStatus: HorseHealthStatus.QUARANTINED,
      reason: 'Nghi cúm ngựa',
    });
    expect(horseHealth.applyHealthStatus).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        to: HorseHealthStatus.QUARANTINED,
        reason: 'Nghi cúm ngựa',
        feature: 'F3.7',
      }),
    );
    expect(result).toEqual({
      horseId: 'h1',
      changed: true,
      from: HorseHealthStatus.ELIGIBLE,
      to: HorseHealthStatus.QUARANTINED,
    });
    expect(events.publish).toHaveBeenCalledWith(
      MEDICAL_HEALTH_CHANGED_EVENT,
      expect.objectContaining({ to: HorseHealthStatus.QUARANTINED }),
    );
  });

  it('reports no change and publishes nothing for the same status', async () => {
    const result = await service.updateHealth(vet, 'h1', {
      healthStatus: HorseHealthStatus.ELIGIBLE,
      reason: 'Kiểm lại',
    });
    expect(result.changed).toBe(false);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('answers not found for the history of a horse outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
    await expect(
      service.history({ sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] }, 'h9'),
    ).rejects.toThrow(NotFoundException);
    expect(repository.history).not.toHaveBeenCalled();
  });
});
