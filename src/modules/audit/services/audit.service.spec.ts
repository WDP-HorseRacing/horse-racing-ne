import { EntityManager } from 'typeorm';
import { AuditAction } from '../constants/audit-action.enum';
import { AuditEntityType } from '../constants/audit-entity-type.enum';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { AuditService } from './audit.service';

describe('AuditService.record', () => {
  it('inserts the entry through the given transaction manager', async () => {
    const save = jest.fn();
    const getRepository = jest.fn(() => ({ save }));
    const manager = { getRepository } as unknown as EntityManager;

    await new AuditService().record(manager, {
      actorId: 'user-1',
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: 'h1',
      before: { name: 'Gió Bắc' },
      after: { name: 'Gió Nam' },
    });

    expect(getRepository).toHaveBeenCalledWith(AuditLogEntity);
    expect(save).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: 'h1',
      beforeData: { name: 'Gió Bắc' },
      afterData: { name: 'Gió Nam' },
      correlationId: null,
      reason: null,
      feature: null,
    });
  });

  it('saves reason and feature when provided', async () => {
    const save = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ save })),
    } as unknown as EntityManager;

    await new AuditService().record(manager, {
      actorId: 'user-1',
      action: AuditAction.RESTORE,
      entityType: AuditEntityType.HORSE_MEASUREMENT,
      entityId: 'm1',
      before: null,
      after: { deletedAt: null },
      reason: 'Nhập nhầm, khôi phục lại',
      feature: 'F1.4',
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RESTORE,
        reason: 'Nhập nhầm, khôi phục lại',
        feature: 'F1.4',
      }),
    );
  });

  it('stores null when reason and feature are explicitly null', async () => {
    const save = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ save })),
    } as unknown as EntityManager;

    await new AuditService().record(manager, {
      actorId: null,
      action: AuditAction.DELETE,
      entityType: AuditEntityType.GROOM_ASSIGNMENT,
      entityId: 'g1',
      before: { id: 'g1' },
      after: null,
      reason: null,
      feature: null,
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: null, feature: null }),
    );
  });
});
