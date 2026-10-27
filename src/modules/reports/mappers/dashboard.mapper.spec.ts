import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/enums/horse-status.enum';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import type { DashboardHorseRow } from '../types/report.types';
import { toDashboard } from './dashboard.mapper';

const horse = (
  horseId: string,
  lifecycleStatus: HorseLifecycleStatus,
): DashboardHorseRow => ({
  horseId,
  horseName: horseId,
  lifecycleStatus,
  barnId: null,
  barnName: null,
  healthStatus: HorseHealthStatus.ELIGIBLE,
  trainingLocked: true,
  latestWeightKg: null,
});

describe('toDashboard', () => {
  it('counts only active horses in the herd but lists and sums every horse read', () => {
    const dashboard = toDashboard({
      period: {
        from: '2026-08-01',
        to: '2026-08-31',
        start: new Date('2026-07-31T17:00:00Z'),
        end: new Date('2026-08-31T17:00:00Z'),
      },
      horses: [
        horse('gio', HorseLifecycleStatus.TRANSFERRED),
        horse('may', HorseLifecycleStatus.ACTIVE),
      ],
      participantCounts: [
        {
          horseId: 'gio',
          status: SessionParticipantStatus.COMPLETED,
          intensity: TrainingIntensity.LIGHT,
          weekStart: '2026-08-10',
          count: 12,
        },
      ],
      sessions: 12,
      metricsByHorse: [],
      metricsByWeek: [],
    });

    expect(dashboard.herd).toMatchObject({
      total: 1,
      byHealthStatus: { ELIGIBLE: 1 },
      trainingLocked: 1,
    });
    expect(dashboard.training.completed).toBe(12);
    expect(
      dashboard.horses.map(({ horseId, lifecycleStatus, completed }) => ({
        horseId,
        lifecycleStatus,
        completed,
      })),
    ).toEqual([
      {
        horseId: 'gio',
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
        completed: 12,
      },
      {
        horseId: 'may',
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        completed: 0,
      },
    ]);
  });
});
