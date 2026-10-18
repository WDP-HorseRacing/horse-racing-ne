import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../horses/enums/horse-measurement-alert.enum';
import { HORSE_MEASUREMENT_SPECS } from '../../horses/constants/horse.constants';
import { HorseMeasurementSource } from '../../horses/enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import { HorseNotificationsService } from './horse-notifications.service';
import { NotificationDeliveryService } from './notification-delivery.service';

function setup() {
  const recipients = {
    findActiveUserIdsByRole: jest.fn().mockResolvedValue(['vet-1', 'vet-2']),
    findHorseBarnContact: jest.fn(),
    findBarnContact: jest.fn(),
    findHorseMedicalContact: jest.fn(),
    findHorseName: jest.fn(),
    isActiveUserWithRole: jest.fn(),
  };
  const notifications = { send: jest.fn().mockResolvedValue([]) };
  const dataSource = {
    manager: {
      findOne: async () => {
        const name = (await recipients.findHorseName()) as string | null;
        return name === null ? null : { name };
      },
    },
  } as unknown as DataSource;
  const service = new HorseNotificationsService(
    recipients as unknown as NotificationRecipientsRepository,
    notifications as unknown as NotificationDeliveryService,
    dataSource,
  );
  return { service, recipients, notifications };
}

const feverEvent: HorseMeasurementAlertEvent = {
  alert: HorseMeasurementAlert.FEVER,
  severity: HorseMeasurementAlertSeverity.URGENT,
  measurementId: 'measurement-1',
  horseId: 'horse-1',
  measuredBy: 'groom-1',
  type: HorseMeasurementType.TEMPERATURE,
  value: 39.1,
  unit: HORSE_MEASUREMENT_SPECS[HorseMeasurementType.TEMPERATURE].unit,
  measuredAt: '2026-09-23T00:00:00.000Z',
  source: HorseMeasurementSource.MANUAL,
};

const weightDropEvent: HorseMeasurementAlertEvent = {
  alert: HorseMeasurementAlert.WEIGHT_DROP,
  severity: HorseMeasurementAlertSeverity.WARNING,
  baselineValue: 500,
  dropPercent: 6,
  measurementId: 'measurement-2',
  horseId: 'horse-1',
  measuredBy: 'groom-1',
  type: HorseMeasurementType.WEIGHT,
  value: 470,
  unit: 'kg',
  measuredAt: '2026-09-23T00:00:00.000Z',
  source: HorseMeasurementSource.MANUAL,
};

describe('HorseNotificationsService.notifyMeasurementAlert', () => {
  it('sends an URGENT fever notice to every active vet, the barn head trainer and the owner', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'ht-1',
      ownerId: 'owner-1',
    });

    await service.notifyMeasurementAlert(feverEvent);

    expect(recipients.findHorseMedicalContact).toHaveBeenCalledWith('horse-1');
    expect(notifications.send).toHaveBeenCalledWith({
      eventId: 'measurement-1',
      recipientIds: ['vet-1', 'vet-2', 'ht-1', 'owner-1'],
      category: NotificationCategory.MEASUREMENT_ALERT,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN: Ngựa Sao Mai bị sốt',
      message:
        'Ngựa Sao Mai có thân nhiệt 39.1 °C, vượt ngưỡng sốt. Cần kiểm tra ngay.',
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'horse-1',
        horseId: 'horse-1',
      },
    });
  });

  it('sends only to vets when the horse has no barn head trainer and no owner', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
      ownerId: null,
    });

    await service.notifyMeasurementAlert(feverEvent);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['vet-1', 'vet-2'] }),
    );
  });

  it('sends a HIGH weight-drop notice with horse name, drop percent and values', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Gió Bắc',
      headTrainerId: 'ht-1',
      ownerId: null,
    });

    await service.notifyMeasurementAlert(weightDropEvent);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'measurement-2',
        recipientIds: ['vet-1', 'vet-2', 'ht-1'],
        priority: NotificationPriority.HIGH,
        title: 'Cảnh báo: Ngựa Gió Bắc giảm cân',
        message:
          'Ngựa Gió Bắc giảm 6% cân nặng trong 14 ngày (từ 500 kg xuống 470 kg).',
      }),
    );
  });

  it('sends nothing when the horse cannot be found', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue(null);

    await expect(service.notifyMeasurementAlert(feverEvent)).resolves.toEqual(
      [],
    );
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyBarnAssigned', () => {
  const notice = { eventId: 'event-9', horseId: 'horse-1', barnId: 'barn-1' };

  it('notifies the head trainer of the new barn', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');
    recipients.findBarnContact.mockResolvedValue({
      barnName: 'Khu A',
      headTrainerId: 'ht-1',
    });

    await service.notifyBarnAssigned(notice);

    expect(recipients.findBarnContact).toHaveBeenCalledWith('barn-1');
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-9',
        recipientIds: ['ht-1'],
        category: NotificationCategory.BARN_ASSIGNED,
        priority: NotificationPriority.NORMAL,
      }),
    );
  });

  it('sends nothing when the barn has no head trainer', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');
    recipients.findBarnContact.mockResolvedValue({
      barnName: 'Khu A',
      headTrainerId: null,
    });

    await expect(service.notifyBarnAssigned(notice)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('sends nothing when the barn is missing', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');
    recipients.findBarnContact.mockResolvedValue(null);

    await expect(service.notifyBarnAssigned(notice)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyGroomChanged', () => {
  const base = { eventId: 'assignment-1', horseId: 'horse-1' };

  it('tells the new groom about the assignment and the old groom about the release', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');

    await service.notifyGroomChanged({
      ...base,
      newGroomId: 'groom-new',
      previousGroomId: 'groom-old',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'assignment-1',
        recipientIds: ['groom-new'],
        title: 'Phân công chăm ngựa mới',
        priority: NotificationPriority.NORMAL,
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'assignment-1',
        recipientIds: ['groom-old'],
        title: 'Kết thúc phân công chăm ngựa',
      }),
    );
  });

  it('only tells the new groom when the horse had no groom', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');

    await service.notifyGroomChanged({
      ...base,
      newGroomId: 'groom-new',
      previousGroomId: null,
    });

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['groom-new'] }),
    );
  });

  it('only tells the old groom when the head trainer removes the groom', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');

    await service.notifyGroomChanged({
      ...base,
      newGroomId: null,
      previousGroomId: 'groom-old',
    });

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['groom-old'] }),
    );
  });

  it('sends nothing when the horse is missing', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue(null);

    await expect(
      service.notifyGroomChanged({
        ...base,
        newGroomId: 'groom-new',
        previousGroomId: null,
      }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyChecklistTaskAdded', () => {
  const notice = {
    eventId: 'item-1',
    checklistId: 'checklist-1',
    horseId: 'horse-1',
    groomId: 'groom-1',
    taskName: 'Ngâm chân nước đá',
  };

  it('tells the checklist groom about the new task', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');

    await service.notifyChecklistTaskAdded(notice);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'item-1',
        recipientIds: ['groom-1'],
        category: NotificationCategory.DAILY_CHECKLIST,
        priority: NotificationPriority.NORMAL,
        message: expect.stringContaining('Ngâm chân nước đá') as string,
      }),
    );
  });

  it('sends nothing when the horse is missing', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue(null);

    await expect(service.notifyChecklistTaskAdded(notice)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyIncidentReported', () => {
  const notice = {
    eventId: 'incident-1',
    incidentId: 'incident-1',
    horseId: 'horse-1',
    urgent: true,
    description: 'Nằm lăn, bỏ ăn từ sáng',
    assignedGroomId: null,
  };

  it('tells the barn head trainer with HIGH priority for an urgent incident', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'trainer-1',
    });

    await service.notifyIncidentReported(notice);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'incident-1',
        recipientIds: ['trainer-1'],
        category: NotificationCategory.INCIDENT,
        priority: NotificationPriority.HIGH,
        message: 'Ngựa Sao Mai: Nằm lăn, bỏ ăn từ sáng',
      }),
    );
  });

  it('uses NORMAL priority for a routine incident', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'trainer-1',
    });

    await service.notifyIncidentReported({ ...notice, urgent: false });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ priority: NotificationPriority.NORMAL }),
    );
  });

  it('also tells the groom in charge when another groom reported it', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
    });

    await service.notifyIncidentReported({
      ...notice,
      assignedGroomId: 'groom-1',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['groom-1'] }),
    );
  });

  it('sends nothing when the barn has no head trainer', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
    });

    await expect(service.notifyIncidentReported(notice)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifySurchargeAdded', () => {
  const notice = {
    eventId: 'surcharge-1',
    horseId: 'horse-1',
    description: 'Thức ăn loại 1',
    dailyAmount: 50000,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  };

  it('tells the barn head trainer what care the horse now gets, and the owner what it costs', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'trainer-1',
      ownerId: 'owner-1',
    });

    await service.notifySurchargeAdded(notice);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'surcharge-1',
        recipientIds: ['trainer-1'],
        category: NotificationCategory.SURCHARGE,
        message: 'Ngựa Sao Mai từ 01/11/2026 đến 30/11/2026: Thức ăn loại 1',
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'surcharge-1',
        recipientIds: ['owner-1'],
        message:
          'Thức ăn loại 1, từ 01/11/2026 đến 30/11/2026, 50.000 đồng mỗi ngày',
      }),
    );
  });

  it('sends nothing when the horse has neither a barn head trainer nor an owner', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
      ownerId: null,
    });

    await expect(service.notifySurchargeAdded(notice)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyLifecycleChanged', () => {
  const event = {
    eventId: 'life-1',
    horseId: 'horse-1',
    from: HorseLifecycleStatus.ACTIVE,
    to: HorseLifecycleStatus.RETIRED,
    reason: 'Hết tuổi đua',
    ownerId: 'owner-1',
  };

  it('tells the owner the new lifecycle and the reason', async () => {
    const { service, recipients, notifications } = setup();
    recipients.isActiveUserWithRole.mockResolvedValue(true);
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'trainer-1',
      ownerId: 'owner-1',
    });

    await service.notifyLifecycleChanged(event);

    expect(recipients.isActiveUserWithRole).toHaveBeenCalledWith(
      'owner-1',
      UserRole.HORSE_OWNER,
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'life-1',
        recipientIds: ['owner-1'],
        category: NotificationCategory.HORSE_LIFECYCLE,
        title: 'Ngựa Sao Mai: Đã giải nghệ',
        message:
          'Vòng đời của ngựa Sao Mai chuyển từ Đang hoạt động sang Đã giải nghệ. Lý do: Hết tuổi đua',
        resource: expect.objectContaining({ id: 'horse-1' }) as unknown,
      }),
    );
  });

  it('tells the owner whose ownership just ended on a sale, without a link to the horse', async () => {
    const { service, recipients, notifications } = setup();
    recipients.isActiveUserWithRole.mockResolvedValue(true);
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
      ownerId: null,
    });

    await service.notifyLifecycleChanged({
      ...event,
      to: HorseLifecycleStatus.TRANSFERRED,
      reason: 'Bán cho trại B',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: ['owner-1'],
        title: 'Ngựa Sao Mai: Đã chuyển nhượng',
        resource: null,
      }),
    );
  });

  it('sends nothing when the event has no owner', async () => {
    const { service, notifications } = setup();

    await expect(
      service.notifyLifecycleChanged({ ...event, ownerId: null }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('sends nothing when the owner is no longer an active horse owner', async () => {
    const { service, recipients, notifications } = setup();
    recipients.isActiveUserWithRole.mockResolvedValue(false);

    await expect(service.notifyLifecycleChanged(event)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyIncidentStale', () => {
  const notice = {
    eventId: 'stale-1',
    incidentId: 'incident-1',
    horseId: 'horse-1',
    description: 'Bỏ ăn',
    hours: 5,
  };

  it('reminds every club manager and the barn head trainer', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findActiveUserIdsByRole.mockResolvedValue(['cm-1']);
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'trainer-1',
    });

    await service.notifyIncidentStale(notice);

    expect(recipients.findActiveUserIdsByRole).toHaveBeenCalledWith(
      UserRole.CLUB_MANAGER,
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'stale-1',
        recipientIds: ['cm-1', 'trainer-1'],
        category: NotificationCategory.INCIDENT,
        priority: NotificationPriority.HIGH,
      }),
    );
  });

  it('sends nothing when the horse is missing', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue(null);

    await expect(service.notifyIncidentStale(notice)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyGroomReleasedByTransfer', () => {
  it('tells the groom that the horse was transferred', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Hỏa Long');

    await service.notifyGroomReleasedByTransfer({
      eventId: 'event-transfer',
      horseId: 'horse-1',
      groomId: 'groom-old',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-transfer',
        recipientIds: ['groom-old'],
        category: NotificationCategory.GROOM_ASSIGNMENT,
        priority: NotificationPriority.NORMAL,
        title: 'Ngựa đã chuyển nhượng',
        message: expect.stringContaining(
          'Ngựa Hỏa Long đã chuyển nhượng, bạn không còn phụ trách',
        ) as unknown,
      }),
    );
  });

  it('sends nothing when the horse is missing', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue(null);

    await expect(
      service.notifyGroomReleasedByTransfer({
        eventId: 'event-transfer',
        horseId: 'horse-1',
        groomId: 'groom-old',
      }),
    ).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyHorseDeceased', () => {
  const event = {
    eventId: 'event-9',
    horseId: 'horse-1',
    barnId: 'barn-1',
    groomId: 'groom-1',
    dateOfDeath: '2026-10-01',
    reason: 'Đau bụng cấp',
  };

  it('tells the active owner, the old barn head trainer, the old groom and every club manager', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findActiveUserIdsByRole.mockResolvedValue(['cm-1', 'owner-1']);
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
      ownerId: 'owner-1',
    });
    recipients.findBarnContact.mockResolvedValue({
      barnName: 'Khu A',
      headTrainerId: 'ht-1',
    });

    await service.notifyHorseDeceased(event);

    expect(recipients.findBarnContact).toHaveBeenCalledWith('barn-1');
    expect(recipients.findActiveUserIdsByRole).toHaveBeenCalledWith(
      UserRole.CLUB_MANAGER,
    );
    expect(notifications.send).toHaveBeenCalledWith({
      eventId: 'event-9',
      recipientIds: ['owner-1', 'ht-1', 'groom-1', 'cm-1'],
      category: NotificationCategory.HORSE_LIFECYCLE,
      priority: NotificationPriority.HIGH,
      title: 'Ngựa Sao Mai đã mất',
      message: 'Ngày mất 01/10/2026. Nguyên nhân: Đau bụng cấp',
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'horse-1',
        horseId: 'horse-1',
      },
    });
  });

  it('skips the people that are missing or no longer active', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findActiveUserIdsByRole.mockResolvedValue([]);
    recipients.findHorseMedicalContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
      ownerId: null,
    });

    await service.notifyHorseDeceased({
      ...event,
      barnId: null,
      groomId: null,
    });

    expect(recipients.findBarnContact).not.toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [] }),
    );
  });

  it('skips a horse that no longer exists', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseMedicalContact.mockResolvedValue(null);

    await expect(service.notifyHorseDeceased(event)).resolves.toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService.notifyOwnershipTransferred', () => {
  const event = {
    eventId: 'event-7',
    horseId: 'horse-1',
    fromOwnerId: 'owner-a',
    toOwnerId: 'owner-b',
    transferredAt: '2026-06-01T03:00:00.000Z',
  };

  it('tells the new owner with a link to the horse and the old owner without one', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue('Sao Mai');
    notifications.send
      .mockResolvedValueOnce(['owner-b'])
      .mockResolvedValueOnce(['owner-a']);

    await expect(service.notifyOwnershipTransferred(event)).resolves.toEqual([
      'owner-b',
      'owner-a',
    ]);

    expect(notifications.send).toHaveBeenNthCalledWith(1, {
      eventId: 'event-7',
      recipientIds: ['owner-b'],
      category: NotificationCategory.OWNERSHIP,
      priority: NotificationPriority.NORMAL,
      title: 'Bạn đã trở thành chủ sở hữu ngựa Sao Mai',
      message: 'Hiệu lực từ 01/06/2026',
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'horse-1',
        horseId: 'horse-1',
      },
    });
    expect(notifications.send).toHaveBeenNthCalledWith(2, {
      eventId: 'event-7',
      recipientIds: ['owner-a'],
      category: NotificationCategory.OWNERSHIP,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa Sao Mai đã chuyển sang chủ khác',
      message:
        'Hiệu lực từ 01/06/2026. Chi phí y tế trong thời gian bạn sở hữu vẫn được giữ trong báo cáo',
      resource: null,
    });
  });

  it('skips a horse that no longer exists', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseName.mockResolvedValue(null);

    await expect(service.notifyOwnershipTransferred(event)).resolves.toEqual(
      [],
    );
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('HorseNotificationsService checklist generation notices', () => {
  it('tells every club manager which horses have no checklist today', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findActiveUserIdsByRole.mockResolvedValue(['cm-1', 'cm-2']);

    await service.notifyChecklistGenerationFailed({
      eventId: 'failed-1',
      date: '2026-10-17',
      horseNames: ['Winx', 'Gió'],
    });

    expect(recipients.findActiveUserIdsByRole).toHaveBeenCalledWith(
      UserRole.CLUB_MANAGER,
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'failed-1',
        recipientIds: ['cm-1', 'cm-2'],
        category: NotificationCategory.DAILY_CHECKLIST,
        priority: NotificationPriority.HIGH,
        message:
          'Chưa có checklist hôm nay cho Winx, Gió. Hệ thống đang thử lại.',
      }),
    );
  });

  it('tells the club managers when every checklist of today is there again', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findActiveUserIdsByRole.mockResolvedValue(['cm-1']);

    await service.notifyChecklistGenerationRecovered({
      eventId: 'recovered-1',
      date: '2026-10-17',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'recovered-1',
        recipientIds: ['cm-1'],
        message: 'Đã có đủ checklist hôm nay.',
      }),
    );
  });
});

describe('HorseNotificationsService.notifySessionCancelled', () => {
  const notice = {
    eventId: 'cancel-1',
    sessionId: 'session-1',
    sessionName: 'Sức bền sáng',
    scheduledStartAt: '2026-11-20T23:00:00.000Z',
    reason: 'Mưa lớn',
    runs: [
      { horseId: 'winx', groomId: 'groom-1' },
      { horseId: 'gio', groomId: 'groom-1' },
      { horseId: 'may', groomId: null },
      { horseId: 'locked', groomId: 'groom-locked' },
    ],
  };

  it('sends one notice per groom listing their horses, falling back to the groom in charge', async () => {
    const { service, recipients, notifications } = setup();
    const contacts: Record<string, { horseName: string; groomId: string }> = {
      winx: { horseName: 'Winx', groomId: 'groom-1' },
      gio: { horseName: 'Gió', groomId: 'groom-1' },
      may: { horseName: 'Mây', groomId: 'groom-2' },
      locked: { horseName: 'Sao', groomId: 'groom-3' },
    };
    recipients.findHorseMedicalContact.mockImplementation((id: string) =>
      Promise.resolve(contacts[id]),
    );
    recipients.isActiveUserWithRole.mockImplementation((id: string) =>
      Promise.resolve(id !== 'groom-locked'),
    );

    await service.notifySessionCancelled(notice);

    const sent = (
      notifications.send.mock.calls as Array<
        [{ recipientIds: string[]; message: string }]
      >
    ).map(([draft]) => [draft.recipientIds, draft.message]);
    expect(sent).toEqual([
      [
        ['groom-1'],
        'Buổi tập Sức bền sáng lúc 06:00 ngày 21/11/2026 đã hủy: Mưa lớn. Không dắt Winx, Gió ra sân.',
      ],
      [['groom-2'], expect.stringContaining('Không dắt Mây ra sân.')],
      [['groom-3'], expect.stringContaining('Không dắt Sao ra sân.')],
    ]);
  });
});
