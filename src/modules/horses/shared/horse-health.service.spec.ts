import { EntityManager } from 'typeorm';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseEntity } from '../entities/horse.entity';
import { HorseHealthStatus } from '../enums/horse-status.enum';
import { HorseHealthService } from './horse-health.service';

describe('HorseHealthService.applyHealthStatus', () => {
  let update: jest.Mock;
  let manager: { findOneOrFail: jest.Mock; getRepository: jest.Mock };
  let audit: { record: jest.Mock };
  let service: HorseHealthService;

  const input = (to: HorseHealthStatus) => ({
    horseId: 'h1',
    to,
    actorId: 'vet-1',
    reason: 'Viêm gân chân trước',
    feature: 'F3.7',
  });

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({ affected: 1 });
    manager = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 'h1',
        healthStatus: HorseHealthStatus.ELIGIBLE,
      }),
      getRepository: jest.fn(() => ({ update })),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new HorseHealthService(audit);
  });

  it('updates the column and audits before, after and reason through the given manager', async () => {
    const result = await service.applyHealthStatus(
      manager as unknown as EntityManager,
      input(HorseHealthStatus.INJURED),
    );

    expect(result).toEqual({
      changed: true,
      from: HorseHealthStatus.ELIGIBLE,
      to: HorseHealthStatus.INJURED,
    });
    expect(manager.getRepository).toHaveBeenCalledWith(HorseEntity);
    expect(update).toHaveBeenCalledWith(
      { id: 'h1' },
      { healthStatus: HorseHealthStatus.INJURED },
    );
    expect(audit.record).toHaveBeenCalledWith(manager, {
      actorId: 'vet-1',
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: 'h1',
      before: { healthStatus: HorseHealthStatus.ELIGIBLE },
      after: { healthStatus: HorseHealthStatus.INJURED },
      reason: 'Viêm gân chân trước',
      feature: 'F3.7',
    });
  });

  it('writes nothing when the status is unchanged', async () => {
    const result = await service.applyHealthStatus(
      manager as unknown as EntityManager,
      input(HorseHealthStatus.ELIGIBLE),
    );

    expect(result.changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
