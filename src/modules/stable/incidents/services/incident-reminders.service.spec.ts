import { DataSource, EntityManager } from 'typeorm';
import { DomainEventPublisher } from '../../../../common/infrastructure/events/domain-event.publisher';
import { deterministicUuid } from '../../../../common/utils/data/deterministic-uuid';
import { INCIDENT_REMINDER_AFTER_HOURS } from '../../constants/incident.constants';
import { IncidentStatus } from '../../constants/incident-status.enum';
import { INCIDENT_STALE_EVENT } from '../../constants/stable-events.constants';
import { IncidentEntity } from '../../entities/incident.entity';
import { IncidentRemindersService } from './incident-reminders.service';

describe('IncidentRemindersService', () => {
  let manager: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let events: { publish: jest.Mock };
  let builder: Record<string, jest.Mock>;
  let service: IncidentRemindersService;

  beforeEach(() => {
    builder = {};
    for (const method of ['update', 'set', 'where', 'andWhere', 'returning']) {
      builder[method] = jest.fn(() => builder);
    }
    builder.execute = jest.fn().mockResolvedValue({
      raw: [
        {
          id: 'incident-1',
          horse_id: 'horse-1',
          description: 'Ngựa bị đau chân',
          created_at: new Date('2026-11-08T00:00:00.000Z'),
        },
      ],
    });
    manager = {
      createQueryBuilder: jest.fn(() => builder),
    };
    transaction = jest.fn(
      (work: (entityManager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    );
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { transaction } as unknown as DataSource;
    service = new IncidentRemindersService(
      events as unknown as DomainEventPublisher,
      dataSource,
    );
  });

  describe('remindStale', () => {
    it('marks stale open incidents once and publishes an event for each', async () => {
      const now = new Date('2026-11-09T00:00:00.000Z');
      await expect(service.remindStale(now)).resolves.toBe(1);

      expect(builder.update).toHaveBeenCalledWith(IncidentEntity);
      expect(builder.set).toHaveBeenCalledWith({ remindedAt: now });
      expect(builder.where).toHaveBeenCalledWith('status = :open', {
        open: IncidentStatus.OPEN,
      });
      expect(builder.andWhere).toHaveBeenCalledWith('reminded_at IS NULL');
      expect(builder.andWhere).toHaveBeenCalledWith('created_at <= :cutoff', {
        cutoff: new Date(
          now.getTime() - INCIDENT_REMINDER_AFTER_HOURS * 3_600_000,
        ),
      });
      expect(builder.returning).toHaveBeenCalledWith(
        'id, horse_id, description, created_at',
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        INCIDENT_STALE_EVENT,
        {
          eventId: deterministicUuid('incident-stale:incident-1'),
          incidentId: 'incident-1',
          horseId: 'horse-1',
          description: 'Ngựa bị đau chân',
          hours: 24,
        },
      );
    });

    it('returns zero and publishes no event when no incidents are stale', async () => {
      builder.execute.mockResolvedValue({ raw: [] });

      await expect(service.remindStale(new Date())).resolves.toBe(0);
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
