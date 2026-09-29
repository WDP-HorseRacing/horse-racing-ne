import { NotFoundException } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseTrainingSessionQueryDto } from '../dto/horse-training.dto';
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
    phaseName: 'Nền tảng',
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
  let horseAccess: { findReadable: jest.Mock };
  let repository: {
    listClasses: jest.Mock;
    listSessions: jest.Mock;
    listTrialResults: jest.Mock;
  };
  let service: HorseTrainingService;

  const query = (patch: Partial<HorseTrainingSessionQueryDto> = {}) =>
    Object.assign(new HorseTrainingSessionQueryDto(), patch);

  beforeEach(() => {
    horseAccess = { findReadable: jest.fn().mockResolvedValue({ id: 'h1' }) };
    repository = {
      listClasses: jest.fn().mockResolvedValue([]),
      listSessions: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      listTrialResults: jest.fn().mockResolvedValue([]),
    };
    service = new HorseTrainingService(
      horseAccess as unknown as HorseAccessService,
      repository as unknown as HorseTrainingRepository,
    );
  });

  it('returns 404 and reads nothing when the horse is outside the caller scope', async () => {
    horseAccess.findReadable.mockRejectedValue(new NotFoundException());

    await expect(service.listClasses(actor, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.listSessions(actor, 'h1', query())).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.listClasses).not.toHaveBeenCalled();
    expect(repository.listSessions).not.toHaveBeenCalled();
  });

  it('checks the caller scope with the shared horse access rules', async () => {
    await service.listClasses(actor, 'h1');

    expect(horseAccess.findReadable).toHaveBeenCalledWith(actor, 'h1');
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
    repository.listTrialResults.mockResolvedValue([
      {
        participantId: 'p1',
        attemptNo: 1,
        elapsedMs: '61000',
        notes: 'Xuất phát chậm',
        recordedAt: new Date('2026-10-01T08:30:00Z'),
      },
    ]);

    const page = await service.listSessions(actor, 'h1', query());

    expect(repository.listTrialResults).toHaveBeenCalledWith(['p1', 'p2']);
    expect(page.items[0].trialResults).toEqual([
      {
        attemptNo: 1,
        elapsedMs: '61000',
        notes: 'Xuất phát chậm',
        recordedAt: new Date('2026-10-01T08:30:00Z'),
      },
    ]);
    expect(page.items[1].trialResults).toEqual([]);
    expect(page.meta).toEqual({ total: 25, page: 1, limit: 20, totalPages: 2 });
  });
});
