import { SupplyRequestStatus } from '../../supplies/enums/supply-request-status.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import { SupplyNotificationsService } from './supply-notifications.service';

describe('SupplyNotificationsService', () => {
  const recipients = {
    findActiveUserIdsByRole: jest.fn().mockResolvedValue(['cm-1', 'cm-2']),
  };
  const notifications = { send: jest.fn().mockResolvedValue(['x']) };
  const service = new SupplyNotificationsService(
    recipients as unknown as NotificationRecipientsRepository,
    notifications as unknown as NotificationDeliveryService,
  );

  beforeEach(() => notifications.send.mockClear());

  it('tells every club manager about a new request', async () => {
    await service.notifyRequestCreated({
      eventId: 'r1',
      requestId: 'r1',
      itemName: 'Yến mạch',
      unit: 'kg',
      requesterName: 'An',
    });

    expect(notifications.send).toHaveBeenCalledWith({
      eventId: 'r1',
      recipientIds: ['cm-1', 'cm-2'],
      category: NotificationCategory.SUPPLY,
      priority: NotificationPriority.NORMAL,
      title: 'Đề xuất bổ sung vật tư mới',
      message: 'An đề xuất bổ sung Yến mạch',
      resource: null,
    });
  });

  it('tells the requester about a rejection with its reason', async () => {
    await service.notifyRequestStatusChanged({
      eventId: 'e1',
      requestId: 'r1',
      requesterId: 'groom-1',
      itemName: 'Yến mạch',
      unit: 'kg',
      quantity: null,
      status: SupplyRequestStatus.REJECTED,
      reason: 'Kho còn đủ',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: ['groom-1'],
        title: 'Đề xuất bổ sung bị từ chối',
        message: 'Yến mạch. Lý do: Kho còn đủ',
      }),
    );
  });

  it('tells the requester about a cancellation with its reason', async () => {
    await service.notifyRequestStatusChanged({
      eventId: 'e2',
      requestId: 'r1',
      requesterId: 'groom-1',
      itemName: 'Yến mạch',
      unit: 'kg',
      quantity: null,
      status: SupplyRequestStatus.CANCELLED,
      reason: 'Nhà cung cấp hết hàng',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: ['groom-1'],
        title: 'Đề xuất bổ sung đã bị hủy',
        message: 'Yến mạch. Lý do: Nhà cung cấp hết hàng',
      }),
    );
  });

  it('tells the requester the quantity received when fulfilled', async () => {
    await service.notifyRequestStatusChanged({
      eventId: 'e3',
      requestId: 'r1',
      requesterId: 'groom-1',
      itemName: 'Yến mạch',
      unit: 'kg',
      quantity: 40,
      status: SupplyRequestStatus.FULFILLED,
      reason: null,
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Đề xuất bổ sung đã được cấp',
        message: '40 kg Yến mạch',
      }),
    );
  });

  it('sends nothing for a status that is not a decision', async () => {
    await expect(
      service.notifyRequestStatusChanged({
        eventId: 'e1',
        requestId: 'r1',
        requesterId: 'groom-1',
        itemName: 'Yến mạch',
        unit: 'kg',
        quantity: null,
        status: SupplyRequestStatus.PENDING,
        reason: null,
      }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('warns every club manager when an item runs low', async () => {
    await service.notifyLowStock({
      eventId: 'l1',
      itemId: 'i1',
      itemName: 'Yến mạch',
      unit: 'kg',
      quantityOnHand: 8,
      reorderThreshold: 10,
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: ['cm-1', 'cm-2'],
        priority: NotificationPriority.HIGH,
        title: 'Vật tư sắp hết',
        message: 'Yến mạch còn 8 kg, ngưỡng báo thiếu 10 kg',
      }),
    );
  });
});
