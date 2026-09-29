import { DataSource, In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrainingOperationsFacade } from '../shared/training-operations.facade';
import { SessionParticipantsService } from './session-participants.service';

const actor: Actor = { sub: 'kc-ht', roles: [UserRole.HEAD_TRAINER] };

function participant(id: string, horseId: string) {
  return {
    id,
    sessionId: 's1',
    horseId,
    horseEnrollmentId: `e-${horseId}`,
    assignedGroomId: null,
    status: SessionParticipantStatus.PLANNED,
  };
}

describe('SessionParticipantsService.list', () => {
  let rows: ReturnType<typeof participant>[];
  let access: {
    assertCanReadSession: jest.Mock;
    currentUser: jest.Mock;
    canReadParticipant: jest.Mock;
  };
  let manager: { find: jest.Mock };
  let service: SessionParticipantsService;

  beforeEach(() => {
    rows = [participant('p1', 'h1'), participant('p2', 'h2')];
    access = {
      assertCanReadSession: jest.fn().mockResolvedValue(undefined),
      currentUser: jest.fn().mockResolvedValue({ id: 'ht-1' }),
      canReadParticipant: jest.fn().mockResolvedValue(true),
    };
    manager = { find: jest.fn().mockResolvedValue([{ horseId: 'h2' }]) };
    service = new SessionParticipantsService(
      {
        find: jest.fn(() => Promise.resolve(rows)),
      } as unknown as Repository<SessionParticipantEntity>,
      access as unknown as TrainingAccessService,
      {} as TrainingOperationsFacade,
      { manager } as unknown as DataSource,
    );
  });

  it('flags only the horses under an active training lock with one query', async () => {
    const result = await service.list(actor, 's1');

    expect(result.map((item) => [item.id, item.trainingLocked])).toEqual([
      ['p1', false],
      ['p2', true],
    ]);
    expect(manager.find).toHaveBeenCalledTimes(1);
    expect(manager.find).toHaveBeenCalledWith(TrainingLockEntity, {
      select: { horseId: true },
      where: {
        horseId: In(['h1', 'h2']),
        status: TrainingLockStatus.ACTIVE,
      },
    });
  });

  it('checks locks only for the participants the caller can see', async () => {
    access.canReadParticipant.mockImplementation(
      (_actor: Actor, _callerId: string, row: { id: string }) =>
        Promise.resolve(row.id === 'p1'),
    );

    const result = await service.list(actor, 's1');

    expect(result.map((item) => item.id)).toEqual(['p1']);
    expect(manager.find).toHaveBeenCalledWith(
      TrainingLockEntity,
      expect.objectContaining({
        where: expect.objectContaining({ horseId: In(['h1']) }) as unknown,
      }),
    );
  });

  it('skips the lock query when no participant is visible', async () => {
    rows = [];

    await expect(service.list(actor, 's1')).resolves.toEqual([]);
    expect(manager.find).not.toHaveBeenCalled();
  });
});
