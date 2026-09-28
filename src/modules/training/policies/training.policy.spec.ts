import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  assertClassActivatable,
  assertParticipantComplete,
  assertSessionOperational,
  assertSessionWindowInPlan,
  assertTrainableHorse,
} from './training.policy';

describe('training policy', () => {
  it('rejects a reference horse', () => {
    expect(() => assertTrainableHorse(true)).toThrow(BadRequestException);
  });

  it('accepts a club horse', () => {
    expect(() => assertTrainableHorse(false)).not.toThrow();
  });

  it('only activates a draft class', () => {
    expect(() => assertClassActivatable(TrainingClassStatus.DRAFT)).not.toThrow();
    expect(() => assertClassActivatable(TrainingClassStatus.ACTIVE)).toThrow(
      ConflictException,
    );
  });

  it('only allows participant operations while a session is executable', () => {
    expect(() => assertSessionOperational(TrainingSessionStatus.SCHEDULED)).not.toThrow();
    expect(() => assertSessionOperational(TrainingSessionStatus.IN_PROGRESS)).not.toThrow();
    expect(() => assertSessionOperational(TrainingSessionStatus.DRAFT)).toThrow(
      ConflictException,
    );
    expect(() => assertSessionOperational(TrainingSessionStatus.COMPLETED)).toThrow(
      ConflictException,
    );
  });

  it('requires a completed participant before downstream completion', () => {
    expect(() =>
      assertParticipantComplete(SessionParticipantStatus.COMPLETED),
    ).toThrow(ConflictException);
    expect(() =>
      assertParticipantComplete(SessionParticipantStatus.ONGOING),
    ).not.toThrow();
  });

  it('keeps a session window inside the plan date range', () => {
    expect(() =>
      assertSessionWindowInPlan(
        '2026-09-10T08:00:00.000Z',
        '2026-09-10T09:00:00.000Z',
        '2026-09-01',
        '2026-09-30',
      ),
    ).not.toThrow();
    expect(() =>
      assertSessionWindowInPlan(
        '2026-08-31T23:00:00.000Z',
        '2026-09-01T01:00:00.000Z',
        '2026-09-01',
        '2026-09-30',
      ),
    ).toThrow(BadRequestException);
  });
});
