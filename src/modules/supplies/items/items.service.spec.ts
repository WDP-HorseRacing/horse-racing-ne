import { ConflictException } from '@nestjs/common';
import { Not } from 'typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { SupplyItemEntity } from '../entities/supply-item.entity';
import type { SupplyLotEntity } from '../entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';
import { SupplyCategory } from '../enums/supply-category.enum';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';
import type { SupplyStockService } from '../shared/supply-stock.service';
import { SupplyItemsService } from './items.service';

jest.mock('../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'cm-1',
    role: 'CLUB_MANAGER',
    fullName: 'Quản lý',
  }),
}));

describe('SupplyItemsService.update', () => {
  const actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };
  let hasMovements: boolean;
  const stored = (): Partial<SupplyItemEntity> => ({
    id: 'item-1',
    name: 'Yến mạch',
    category: SupplyCategory.FEED,
    unit: 'kg',
    quantityOnHand: '500',
    reorderThreshold: '50',
  });
  const manager = {
    exists: jest.fn(() => Promise.resolve(hasMovements)),
    save: jest.fn((row: Partial<SupplyItemEntity>) => Promise.resolve(row)),
  };
  const stock = { lockItem: jest.fn(() => Promise.resolve(stored())) };
  const items = { findOne: jest.fn(() => Promise.resolve(stored())) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const dataSource = {
    manager,
    transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const service = new SupplyItemsService(
    items as unknown as Repository<SupplyItemEntity>,
    {} as Repository<SupplyStockMovementEntity>,
    {} as Repository<SupplyLotEntity>,
    stock as unknown as SupplyStockService,
    dataSource as unknown as DataSource,
    audit,
    {} as DomainEventPublisher,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    hasMovements = false;
  });

  it('rejects a unit change on an item with stock movements with 409 and saves nothing', async () => {
    hasMovements = true;

    await expect(
      service.update(actor, 'item-1', { unit: 'bao' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.exists).toHaveBeenCalledWith(SupplyStockMovementEntity, {
      where: { itemId: 'item-1', type: Not(SupplyStockMovementType.OPENING) },
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a category change on an item with stock movements with 409', async () => {
    hasMovements = true;

    await expect(
      service.update(actor, 'item-1', { category: SupplyCategory.MEDICINE }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('lets an item with only its opening stock change unit and category', async () => {
    await service.update(actor, 'item-1', {
      unit: 'bao',
      category: SupplyCategory.SUPPLEMENT,
    });

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: 'bao',
        category: SupplyCategory.SUPPLEMENT,
      }),
    );
  });

  it('lets an item with stock movements change its name without reading the ledger', async () => {
    hasMovements = true;

    await service.update(actor, 'item-1', { name: 'Yến mạch Úc' });

    expect(manager.exists).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Yến mạch Úc', unit: 'kg' }),
    );
  });

  it('treats the current unit and category sent again as no change', async () => {
    hasMovements = true;

    await service.update(actor, 'item-1', {
      unit: ' kg ',
      category: SupplyCategory.FEED,
      reorderThreshold: 60,
    });

    expect(manager.exists).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ reorderThreshold: '60' }),
    );
  });
});
