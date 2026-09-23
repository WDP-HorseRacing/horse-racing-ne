import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../horses/enums/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { NotificationPriority } from '../constants/notification-priority.enum';
import { NotificationType } from '../constants/notification-type.enum';
import { NotificationRecipientsRepository } from '../repositories/notification-recipients.repository';
import { HorseNotificationsService } from './horse-notifications.service';
import { NotificationsService } from './notifications.service';

function setup() {
  const recipients = {
    findActiveVeterinarianIds: jest.fn().mockResolvedValue(['vet-1', 'vet-2']),
    findHorseBarnContact: jest.fn(),
    findBarnContact: jest.fn(),
    findHorseName: jest.fn(),
  };
  const notifications = { send: jest.fn().mockResolvedValue([]) };
  const service = new HorseNotificationsService(
    recipients as unknown as NotificationRecipientsRepository,
    notifications as unknown as NotificationsService,
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
  unit: '°C',
  measuredAt: new Date('2026-09-23T00:00:00Z'),
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
  measuredAt: new Date('2026-09-23T00:00:00Z'),
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
      type: NotificationType.WARNING,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN: Ngựa Sao Mai bị sốt',
      message:
        'Ngựa Sao Mai có thân nhiệt 39.1 °C, vượt ngưỡng sốt. Cần kiểm tra ngay.',
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
        type: NotificationType.INFO,
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
        type: NotificationType.INFO,
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
