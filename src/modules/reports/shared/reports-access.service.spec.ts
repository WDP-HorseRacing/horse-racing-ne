import { Types } from 'mongoose';
import { MetricAlertLevel } from '../../performance/enums/metric-alert-level.enum';
import type { ReportPeriod } from '../types/report.types';
import { ReportsAccessService } from './reports-access.service';

describe('ReportsAccessService', () => {
  let metrics: { aggregate: jest.Mock };
  let service: ReportsAccessService;

  beforeEach(() => {
    metrics = { aggregate: jest.fn().mockResolvedValue([]) };
    service = new ReportsAccessService(metrics as never);
  });

  it('does not query MongoDB when there are no horses', async () => {
    await expect(
      service.groupMetrics([], {} as ReportPeriod, 'HORSE'),
    ).resolves.toEqual([]);
    expect(metrics.aggregate).not.toHaveBeenCalled();
  });

  it('groups weekly metrics in the club timezone and converts decimal totals', async () => {
    const period: ReportPeriod = {
      from: '2026-11-02',
      to: '2026-11-08',
      start: new Date('2026-11-01T17:00:00.000Z'),
      end: new Date('2026-11-08T17:00:00.000Z'),
    };
    metrics.aggregate.mockResolvedValue([
      {
        _id: '2026-11-02',
        count: 2,
        sumHeartRateBpm: 240,
        maxHeartRateBpm: 130,
        sumSpeedMps: Types.Decimal128.fromString('4.25'),
        maxSpeedMps: Types.Decimal128.fromString('2.75'),
        alertCount: 1,
      },
    ]);

    await expect(
      service.groupMetrics(['horse-1', 'horse-2'], period, 'WEEK'),
    ).resolves.toEqual([
      {
        key: '2026-11-02',
        count: 2,
        sumHeartRateBpm: 240,
        maxHeartRateBpm: 130,
        sumSpeedMps: '4.25',
        maxSpeedMps: '2.75',
        alertCount: 1,
      },
    ]);

    const pipeline = (
      metrics.aggregate.mock.calls as [
        Record<string, Record<string, unknown>>[],
      ][]
    )[0][0];
    expect(pipeline[0]).toEqual({
      $match: {
        'meta.horseId': { $in: ['horse-1', 'horse-2'] },
        recordedAt: { $gte: period.start, $lt: period.end },
      },
    });
    expect(pipeline[1].$group).toMatchObject({
      _id: {
        $dateToString: {
          format: '%Y-%m-%d',
          timezone: 'Asia/Ho_Chi_Minh',
          date: {
            $dateTrunc: {
              date: '$recordedAt',
              unit: 'week',
              timezone: 'Asia/Ho_Chi_Minh',
              startOfWeek: 'monday',
            },
          },
        },
      },
      alertCount: {
        $sum: {
          $cond: [{ $ne: ['$alertLevel', MetricAlertLevel.NORMAL] }, 1, 0],
        },
      },
    });
  });

  it('uses the session participant id as the key for participant grouping', async () => {
    await service.groupMetrics(
      ['horse-1'],
      {
        from: '2026-11-02',
        to: '2026-11-08',
        start: new Date('2026-11-01T17:00:00.000Z'),
        end: new Date('2026-11-08T17:00:00.000Z'),
      },
      'PARTICIPANT',
    );

    const pipeline = (
      metrics.aggregate.mock.calls as [
        Record<string, Record<string, unknown>>[],
      ][]
    )[0][0];
    expect(pipeline[1].$group?._id).toBe('$meta.sessionParticipantId');
  });
});
