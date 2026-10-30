import { BadRequestException } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../training/enums/training-session-type.enum';
import { ReportsAccessService } from '../shared/reports-access.service';
import type {
  HorseHealthRows,
  HorseProgressRow,
  MetricGroupRow,
} from '../types/report.types';
import { HorseReportsRepository } from './horse-reports.repository';
import { HorseReportsService } from './horse-reports.service';

describe('HorseReportsService', () => {
  const actor: Actor = { sub: 'kc-vet', roles: [] as never[] };
  const horse = {
    id: 'horse-1',
    name: 'Mây',
    healthStatus: HorseHealthStatus.ELIGIBLE,
  };
  const period = { from: '2026-11-01', to: '2026-11-08' };
  let repository: { participants: jest.Mock; health: jest.Mock };
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let reportsAccess: { groupMetrics: jest.Mock };
  let service: HorseReportsService;

  beforeEach(() => {
    repository = {
      participants: jest.fn().mockResolvedValue([
        {
          participantId: 'participant-1',
          sessionId: 'session-1',
          sessionName: 'Tập nhẹ',
          scheduledStartAt: new Date('2026-11-03T03:00:00.000Z'),
          sessionType: TrainingSessionType.REGULAR,
          intensity: TrainingIntensity.LIGHT,
          plannedDistanceM: 1000,
          status: SessionParticipantStatus.COMPLETED,
          trainedSeconds: 600,
          score: 8,
          comment: 'Tốt',
          bestTrialMs: '1234',
          weekStart: '2026-11-02',
        } satisfies HorseProgressRow,
      ]),
      health: jest.fn().mockResolvedValue({
        statusChanges: [],
        measurements: [
          {
            type: HorseMeasurementType.WEIGHT,
            value: '480.5',
            measuredAt: new Date('2026-11-04T00:00:00.000Z'),
            isAbnormal: false,
          },
        ],
        medicalCases: [],
        injuries: [],
        trainingLocks: [],
      } satisfies HorseHealthRows),
    };
    horseAccess = {
      findReadableHorseForActor: jest.fn().mockResolvedValue(horse),
    };
    const participantMetrics: MetricGroupRow[] = [
      {
        key: 'participant-1',
        count: 2,
        sumHeartRateBpm: 240,
        maxHeartRateBpm: 130,
        sumSpeedMps: '5.0',
        maxSpeedMps: '3.0',
        alertCount: 1,
      },
    ];
    const weekMetrics: MetricGroupRow[] = [
      { ...participantMetrics[0], key: '2026-11-02' },
    ];
    reportsAccess = {
      groupMetrics: jest.fn((_horseIds, _period, grouping: string) =>
        Promise.resolve(
          grouping === 'PARTICIPANT' ? participantMetrics : weekMetrics,
        ),
      ),
    };
    service = new HorseReportsService(
      repository as unknown as HorseReportsRepository,
      horseAccess as unknown as HorseAccessService,
      reportsAccess as unknown as ReportsAccessService,
    );
  });

  describe('progress', () => {
    it('checks horse access and combines sessions with participant and weekly metrics', async () => {
      const result = await service.progress(actor, horse.id, period);

      expect(horseAccess.findReadableHorseForActor).toHaveBeenCalledWith(
        actor,
        horse.id,
      );
      expect(repository.participants).toHaveBeenCalledWith(
        horse.id,
        expect.objectContaining(period),
      );
      expect(reportsAccess.groupMetrics).toHaveBeenNthCalledWith(
        1,
        [horse.id],
        expect.objectContaining(period),
        'PARTICIPANT',
      );
      expect(reportsAccess.groupMetrics).toHaveBeenNthCalledWith(
        2,
        [horse.id],
        expect.objectContaining(period),
        'WEEK',
      );
      expect(result).toMatchObject({
        horseId: horse.id,
        horseName: horse.name,
        totals: {
          completed: 1,
          plannedDistanceM: 1000,
          trainedMinutes: 10,
        },
        sessions: [
          {
            participantId: 'participant-1',
            avgHeartRateBpm: 120,
            bestTrialMs: 1234,
            evaluation: { score: 8, comment: 'Tốt' },
          },
        ],
        weekly: [{ weekStart: '2026-11-02', completed: 1, alertCount: 1 }],
      });
    });

    it('rejects a reversed period without loading participant rows', async () => {
      await expect(
        service.progress(actor, horse.id, {
          from: '2026-11-09',
          to: '2026-11-08',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.participants).not.toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('returns health history and converts measurement values to numbers', async () => {
      const result = await service.health(actor, horse.id, period);

      expect(repository.health).toHaveBeenCalledWith(
        horse.id,
        expect.objectContaining(period),
      );
      expect(result).toMatchObject({
        horseId: horse.id,
        horseName: horse.name,
        currentHealthStatus: HorseHealthStatus.ELIGIBLE,
        measurements: [{ type: HorseMeasurementType.WEIGHT, value: 480.5 }],
        statusChanges: [],
        medicalCases: [],
      });
    });
  });
});
