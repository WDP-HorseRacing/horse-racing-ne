import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import type { SupplyStockService } from '../shared/supply-stock.service';
import { SupplyRequestsService } from './requests.service';

jest.mock('../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'cm-1',
    role: 'CLUB_MANAGER',
    fullName: 'Quản lý',
  }),
}));

describe('SupplyRequestsService.updateStatus', () => {
  const actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };
  let stored: Partial<SupplyRequestEntity> | null;
  const manager = {
    findOne: jest.fn(() =>
      Promise.resolve(
        stored && {
          ...stored,
          item: {
            id: 'item-1',
            name: 'Cám',
            unit: 'bao',
            quantityOnHand: '10',
            reorderThreshold: '0',
          },
          requester: { id: 'groom-1' },
          reviewer: stored.reviewedBy ? { id: stored.reviewedBy } : null,
          fulfiller: stored.fulfilledBy ? { id: stored.fulfilledBy } : null,
          canceller: stored.cancelledBy ? { id: stored.cancelledBy } : null,
        },
      ),
    ),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((row: Partial<SupplyRequestEntity>) => {
      stored = { ...row };
      return Promise.resolve(row);
    }),
  };
  const stock = { restock: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const dataSource = {
    manager,
    transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const service = new SupplyRequestsService(
    {} as Repository<SupplyRequestEntity>,
    stock as unknown as SupplyStockService,
    dataSource as unknown as DataSource,
    audit,
    events,
  );

  const approved = (): Partial<SupplyRequestEntity> => ({
    id: 'req-1',
    itemId: 'item-1',
    requestedBy: 'groom-1',
    quantity: null,
    status: SupplyRequestStatus.APPROVED,
    note: null,
    reviewedBy: 'cm-1',
    reviewedAt: new Date('2026-10-18T00:00:00Z'),
    fulfilledBy: null,
    fulfilledAt: null,
    rejectionReason: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stored = approved();
  });

  it('restocks the quantity the club manager received and stores it on the request', async () => {
    const result = await service.updateStatus(actor, 'req-1', {
      status: SupplyRequestStatus.FULFILLED,
      quantity: 40,
      unitPrice: 20000,
    });

    expect(stock.restock).toHaveBeenCalledWith(manager, 'item-1', {
      quantity: '40',
      unitPrice: '20000',
      actorId: 'cm-1',
      requestId: 'req-1',
      note: null,
    });
    expect(result).toMatchObject({
      status: SupplyRequestStatus.FULFILLED,
      quantity: 40,
    });
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        after: {
          status: SupplyRequestStatus.FULFILLED,
          quantity: 40,
          unitPrice: 20000,
        },
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      manager,
      'supplies.request.status-changed',
      expect.objectContaining({ quantity: 40, reason: null }),
    );
  });

  it('refuses to fulfil without the received quantity, before touching stock', async () => {
    const failure = service.updateStatus(actor, 'req-1', {
      status: SupplyRequestStatus.FULFILLED,
      unitPrice: 20000,
    });

    await expect(failure).rejects.toBeInstanceOf(BadRequestException);
    await expect(failure).rejects.toMatchObject({
      response: { errors: [{ field: 'quantity' }] },
    });
    expect(stock.restock).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuses to fulfil without the unit price', async () => {
    await expect(
      service.updateStatus(actor, 'req-1', {
        status: SupplyRequestStatus.FULFILLED,
        quantity: 40,
      }),
    ).rejects.toMatchObject({
      response: { errors: [{ field: 'unitPrice' }] },
    });
    expect(stock.restock).not.toHaveBeenCalled();
  });

  it('cancels an approved request with its reason and keeps the approver', async () => {
    const result = await service.updateStatus(actor, 'req-1', {
      status: SupplyRequestStatus.CANCELLED,
      reason: '  Nhà cung cấp hết hàng ',
    });

    expect(stored).toMatchObject({
      status: SupplyRequestStatus.CANCELLED,
      cancelledBy: 'cm-1',
      cancellationReason: 'Nhà cung cấp hết hàng',
      reviewedBy: 'cm-1',
      rejectionReason: null,
      quantity: null,
    });
    expect(stored?.cancelledAt).toBeInstanceOf(Date);
    expect(result.status).toBe(SupplyRequestStatus.CANCELLED);
    expect(stock.restock).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        before: { status: SupplyRequestStatus.APPROVED },
        after: { status: SupplyRequestStatus.CANCELLED },
        reason: 'Nhà cung cấp hết hàng',
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      manager,
      'supplies.request.status-changed',
      expect.objectContaining({
        status: SupplyRequestStatus.CANCELLED,
        requesterId: 'groom-1',
        quantity: null,
        reason: 'Nhà cung cấp hết hàng',
      }),
    );
  });

  it('refuses to cancel without a reason', async () => {
    await expect(
      service.updateStatus(actor, 'req-1', {
        status: SupplyRequestStatus.CANCELLED,
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuses to cancel a request that is still pending with 409', async () => {
    stored = { ...approved(), status: SupplyRequestStatus.PENDING };

    await expect(
      service.updateStatus(actor, 'req-1', {
        status: SupplyRequestStatus.CANCELLED,
        reason: 'Không cần nữa',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for an unknown request', async () => {
    stored = null;

    await expect(
      service.updateStatus(actor, 'req-1', {
        status: SupplyRequestStatus.CANCELLED,
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
