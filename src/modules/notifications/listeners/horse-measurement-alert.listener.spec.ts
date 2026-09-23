import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../horses/enums/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';
import { HorseMeasurementAlertListener } from './horse-measurement-alert.listener';

const event: HorseMeasurementAlertEvent = {
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

describe('HorseMeasurementAlertListener', () => {
  it('forwards the event to the horse notification service', async () => {
    const notifyMeasurementAlert = jest.fn().mockResolvedValue(['vet-1']);
    const listener = new HorseMeasurementAlertListener({
      notifyMeasurementAlert,
    } as unknown as HorseNotificationsService);

    await listener.handle(event);

    expect(notifyMeasurementAlert).toHaveBeenCalledWith(event);
  });

  it('logs and swallows errors instead of throwing back to the publisher', async () => {
    const listener = new HorseMeasurementAlertListener({
      notifyMeasurementAlert: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as HorseNotificationsService);

    await expect(listener.handle(event)).resolves.toBeUndefined();
  });
});
