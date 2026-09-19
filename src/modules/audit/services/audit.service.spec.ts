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
    });
  });
});
