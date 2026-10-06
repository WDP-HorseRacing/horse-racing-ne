import { DataSource } from 'typeorm';
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
  it('sends an URGENT fever notice to every active vet and the barn head trainer', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: 'ht-1',
    });

    await service.notifyMeasurementAlert(feverEvent);

    expect(recipients.findHorseBarnContact).toHaveBeenCalledWith('horse-1');
    expect(notifications.send).toHaveBeenCalledWith({
      eventId: 'measurement-1',
      recipientIds: ['vet-1', 'vet-2', 'ht-1'],
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

  it('sends only to vets when the horse has no barn head trainer', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Sao Mai',
      headTrainerId: null,
    });

    await service.notifyMeasurementAlert(feverEvent);

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['vet-1', 'vet-2'] }),
    );
  });

  it('sends a HIGH weight-drop notice with horse name, drop percent and values', async () => {
    const { service, recipients, notifications } = setup();
    recipients.findHorseBarnContact.mockResolvedValue({
      horseName: 'Gió Bắc',
      headTrainerId: 'ht-1',
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
    recipients.findHorseBarnContact.mockResolvedValue(null);

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

  it('tells the active owner, the old barn head trainer and the old groom', async () => {
    const { service, recipients, notifications } = setup();
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
    expect(notifications.send).toHaveBeenCalledWith({
      eventId: 'event-9',
      recipientIds: ['owner-1', 'ht-1', 'groom-1'],
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
