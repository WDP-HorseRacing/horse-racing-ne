import { NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { MediaService } from '../../media/services/media.service';
import { PerformanceEvaluationEntity } from '../../performance/entities/performance-evaluation.entity';
import { HorseTrainingSessionQueryDto } from '../dto/horse-training.dto';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { HorseTrainingSessionWhen } from '../enums/horse-training-session-when.enum';
import { HorseTrainingRepository } from './horse-training.repository';
import { HorseTrainingService } from './horse-training.service';

const actor: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };

function sessionRow(participantId: string) {
  return {
    participantId,
    sessionId: `s-${participantId}`,
    classId: 'c1',
    className: 'Lớp 1',
    planName: 'Giáo án 1',
    subjectName: 'Sức bền',
    name: 'Buổi 1',
    sessionType: 'TIME_TRIAL',
    scheduledStartAt: new Date('2026-10-01T08:00:00Z'),
    scheduledEndAt: new Date('2026-10-01T09:00:00Z'),
    location: null,
    surface: null,
    sessionStatus: 'SCHEDULED',
    participantStatus: 'PLANNED',
    groomName: 'Lan',
    absenceReason: null,
    cancelReason: null,
    completedAt: null,
  };
}

describe('HorseTrainingService', () => {
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let repository: {
    listClasses: jest.Mock;
    listSessions: jest.Mock;
  };
  let trialRows: object[];
  let evaluationRows: object[];
  let find: jest.Mock;
  let media: { signDownloadUrls: jest.Mock };
  let service: HorseTrainingService;

  const query = (patch: Partial<HorseTrainingSessionQueryDto> = {}) =>
    Object.assign(new HorseTrainingSessionQueryDto(), patch);

  beforeEach(() => {
    horseAccess = { findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }) };
    repository = {
      listClasses: jest.fn().mockResolvedValue([]),
      listSessions: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    };
    trialRows = [];
    evaluationRows = [];
    find = jest.fn((entity: unknown) =>
      Promise.resolve(
        entity === TrialResultEntity ? trialRows : evaluationRows,
      ),
    );
    media = {
      signDownloadUrls: jest.fn().mockResolvedValue(new Map<string, string>()),
    };
    service = new HorseTrainingService(
      horseAccess as unknown as HorseAccessService,
      repository as unknown as HorseTrainingRepository,
      { manager: { find } } as unknown as DataSource,
      media as unknown as MediaService,
    );
  });

  it('returns 404 and reads nothing when the horse is outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());

    await expect(service.listClasses(actor, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.listSessions(actor, 'h1', query())).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.listClasses).not.toHaveBeenCalled();
    expect(repository.listSessions).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('skips the trial and evaluation reads when the page has no session', async () => {
    const page = await service.listSessions(actor, 'h1', query());

    expect(page.items).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('checks the caller scope with the shared horse access rules', async () => {
    await service.listClasses(actor, 'h1');

    expect(horseAccess.findReadableHorseForActor).toHaveBeenCalledWith(actor, 'h1');
  });

  it('passes the page, class and time filters to the repository', async () => {
    await service.listSessions(
      actor,
      'h1',
      query({
        page: 3,
        limit: 10,
        classId: 'c1',
        when: HorseTrainingSessionWhen.UPCOMING,
      }),
    );

    expect(repository.listSessions).toHaveBeenCalledWith('h1', {
      classId: 'c1',
      when: HorseTrainingSessionWhen.UPCOMING,
      now: expect.any(Date) as unknown,
      skip: 20,
      limit: 10,
    });
  });

  it('attaches each trial result to its own session and builds the page meta', async () => {
    repository.listSessions.mockResolvedValue({
      rows: [sessionRow('p1'), sessionRow('p2')],
      total: 25,
    });
    trialRows = [
      {
        sessionParticipantId: 'p1',
        attemptNo: 1,
        elapsedMs: '61000',
        notes: 'Xuất phát chậm',
        videoMediaId: null,
        recordedAt: new Date('2026-10-01T08:30:00Z'),
      },
    ];

    const page = await service.listSessions(actor, 'h1', query());

    expect(find).toHaveBeenCalledWith(TrialResultEntity, {
      where: { sessionParticipantId: In(['p1', 'p2']) },
      order: { sessionParticipantId: 'ASC', attemptNo: 'ASC' },
    });
    expect(page.items[0].trialResults).toEqual([
      {
        attemptNo: 1,
        elapsedMs: '61000',
        notes: 'Xuất phát chậm',
        videoUrl: null,
        recordedAt: new Date('2026-10-01T08:30:00Z'),
      },
    ]);
    expect(page.items[1].trialResults).toEqual([]);
    expect(page.meta).toEqual({ total: 25, page: 1, limit: 20, totalPages: 2 });
  });

  it('returns a signed videoUrl for a trial with video and null for one without', async () => {
    repository.listSessions.mockResolvedValue({
      rows: [sessionRow('p1')],
      total: 1,
    });
    trialRows = [
      {
        sessionParticipantId: 'p1',
        attemptNo: 1,
        elapsedMs: '61000',
        notes: null,
        videoMediaId: 'm1',
        recordedAt: new Date('2026-10-01T08:30:00Z'),
      },
      {
        sessionParticipantId: 'p1',
        attemptNo: 2,
        elapsedMs: '60000',
        notes: null,
        videoMediaId: null,
        recordedAt: new Date('2026-10-01T08:40:00Z'),
      },
    ];
    media.signDownloadUrls.mockResolvedValue(
      new Map([['m1', 'https://s3/video-m1']]),
    );

    const page = await service.listSessions(actor, 'h1', query());

    expect(media.signDownloadUrls).toHaveBeenCalledWith(['m1']);
    expect(page.items[0].trialResults.map((trial) => trial.videoUrl)).toEqual([
      'https://s3/video-m1',
      null,
    ]);
  });

  it('signs nothing when the caller cannot read the horse', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(
      new NotFoundException(),
    );
    await expect(service.listSessions(actor, 'h1', query())).rejects.toThrow(
      NotFoundException,
    );
    expect(media.signDownloadUrls).not.toHaveBeenCalled();
  });

  it('attaches each evaluation to its own session and leaves the others null', async () => {
    repository.listSessions.mockResolvedValue({
      rows: [sessionRow('p1'), sessionRow('p2')],
      total: 2,
    });
    evaluationRows = [
      {
        sessionParticipantId: 'p2',
        score: 8,
        comment: 'Tốc độ ổn định',
        evaluator: { fullName: 'HT Nam' },
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    ];

    const page = await service.listSessions(actor, 'h1', query());

    expect(find).toHaveBeenCalledWith(PerformanceEvaluationEntity, {
      where: { sessionParticipantId: In(['p1', 'p2']) },
      relations: { evaluator: true },
      withDeleted: true,
    });
    expect(page.items[0].evaluation).toBeNull();
    expect(page.items[1].evaluation).toEqual({
      score: 8,
      comment: 'Tốc độ ổn định',
      evaluatorName: 'HT Nam',
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
  });

  it('keeps the repository order of trials and the first evaluation of each participant', async () => {
    repository.listSessions.mockResolvedValue({
      rows: [sessionRow('p1'), sessionRow('p2')],
      total: 2,
    });
    const trial = (participantId: string, attemptNo: number) => ({
      sessionParticipantId: participantId,
      attemptNo,
      elapsedMs: `${60000 + attemptNo}`,
      notes: null,
      recordedAt: new Date('2026-10-01T08:30:00Z'),
    });
    trialRows = [
      trial('p2', 1),
      trial('p1', 2),
      trial('p2', 3),
      trial('p1', 1),
    ];
    const evaluation = (participantId: string, score: number) => ({
      sessionParticipantId: participantId,
      score,
      comment: null,
      evaluator: { fullName: 'HT Nam' },
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
    evaluationRows = [evaluation('p1', 7), evaluation('p1', 9)];

    const page = await service.listSessions(actor, 'h1', query());

    expect(page.items[0].trialResults.map((t) => t.attemptNo)).toEqual([2, 1]);
    expect(page.items[1].trialResults.map((t) => t.attemptNo)).toEqual([1, 3]);
    expect(page.items[0].evaluation?.score).toBe(7);
    expect(page.items[1].evaluation).toBeNull();
  });

  it('maps an evaluation without evaluator to a null evaluator name', async () => {
    repository.listSessions.mockResolvedValue({
      rows: [sessionRow('p1')],
      total: 1,
    });
    evaluationRows = [
      {
        sessionParticipantId: 'p1',
        score: 6,
        comment: null,
        evaluator: null,
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    ];

    const page = await service.listSessions(actor, 'h1', query());

    expect(page.items[0].evaluation?.evaluatorName).toBeNull();
  });
});
