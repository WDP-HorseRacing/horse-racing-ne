import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import type { MediaService } from '../../media/services/media.service';
import { UserEntity } from '../../users/entities/user.entity';
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
    assignedGroomId: null as string | null,
    status: SessionParticipantStatus.PLANNED,
  };
}

describe('SessionParticipantsService.list', () => {
  let rows: ReturnType<typeof participant>[];
  let access: {
    assertCanReadSession: jest.Mock;
    currentUser: jest.Mock;
    canReadParticipant: jest.Mock;
    horseBriefs: jest.Mock;
  };
  let manager: { find: jest.Mock };
  let media: { signDownloadUrls: jest.Mock };
  let service: SessionParticipantsService;

  beforeEach(() => {
    rows = [participant('p1', 'h1'), participant('p2', 'h2')];
    access = {
      assertCanReadSession: jest.fn().mockResolvedValue(undefined),
      currentUser: jest.fn().mockResolvedValue({ id: 'ht-1' }),
      canReadParticipant: jest.fn().mockResolvedValue(true),
      horseBriefs: jest.fn().mockResolvedValue(
        new Map([
          ['h1', { name: 'Gió', mediaId: 'm1' }],
          ['h2', { name: 'Bão', mediaId: null }],
        ]),
      ),
    };
    manager = {
      find: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === UserEntity
            ? [{ id: 'g1', fullName: 'Groom Một' }]
            : [{ horseId: 'h2' }],
        ),
      ),
    };
    media = {
      signDownloadUrls: jest.fn().mockResolvedValue(new Map()),
    };
    service = new SessionParticipantsService(
      {
        find: jest.fn(() => Promise.resolve(rows)),
      } as unknown as Repository<SessionParticipantEntity>,
      access as unknown as TrainingAccessService,
      {} as TrainingOperationsFacade,
      { manager } as unknown as DataSource,
      media as unknown as MediaService,
    );
  });

  it('flags only the horses under an active training lock with one query', async () => {
    const result = await service.list(actor, 's1');

    expect(result.map((item) => [item.id, item.trainingLocked])).toEqual([
      ['p1', false],
      ['p2', true],
    ]);
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

  it('adds horse name, signed photo and groom name with one query per table', async () => {
    rows[0].assignedGroomId = 'g1';
    media.signDownloadUrls.mockResolvedValue(
      new Map([['m1', 'https://signed/m1']]),
    );

    const result = await service.list(actor, 's1');

    expect(
      result.map((item) => [
        item.horseName,
        item.horsePhotoUrl,
        item.assignedGroomName,
      ]),
    ).toEqual([
      ['Gió', 'https://signed/m1', 'Groom Một'],
      ['Bão', null, null],
    ]);
    expect(access.horseBriefs).toHaveBeenCalledTimes(1);
    expect(access.horseBriefs).toHaveBeenCalledWith(['h1', 'h2']);
    expect(media.signDownloadUrls).toHaveBeenCalledTimes(1);
    expect(media.signDownloadUrls).toHaveBeenCalledWith(['m1']);
    expect(manager.find).toHaveBeenCalledWith(UserEntity, {
      select: { id: true, fullName: true },
      where: { id: In(['g1']) },
      withDeleted: true,
    });
  });

  it('signs and looks up names only for the participants the caller can see', async () => {
    access.canReadParticipant.mockImplementation(
      (_actor: Actor, _callerId: string, row: { id: string }) =>
        Promise.resolve(row.id === 'p2'),
    );

    await service.list(actor, 's1');

    expect(access.horseBriefs).toHaveBeenCalledWith(['h2']);
  });

  it('keeps the groom name null when the groom row is missing', async () => {
    rows[0].assignedGroomId = 'gone';

    const result = await service.list(actor, 's1');

    expect(result[0].assignedGroomName).toBeNull();
  });
});

describe('SessionParticipantsService.absent', () => {
  function setup(status: SessionParticipantStatus) {
    const row = {
      ...participant('p1', 'h1'),
      status,
      absenceReason: null as string | null,
    };
    const manager = {
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    } as unknown as EntityManager;
    const access = {
      currentUser: jest.fn().mockResolvedValue({ id: 'ht-1' }),
      findParticipant: jest
        .fn()
        .mockResolvedValue({ sessionId: 's1', horseId: 'h1' }),
      lockedSession: jest.fn().mockResolvedValue({ status: 'SCHEDULED' }),
      lockedParticipant: jest.fn().mockResolvedValue(row),
      assertCanOperateParticipant: jest.fn().mockResolvedValue(undefined),
    };
    const operations = new TrainingOperationsFacade();
    const refresh = jest
      .spyOn(operations, 'refreshSessionStatus')
      .mockResolvedValue({} as never);
    const service = new SessionParticipantsService(
      {} as Repository<SessionParticipantEntity>,
      access as unknown as TrainingAccessService,
      operations,
      {
        transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
          cb(manager),
        ),
      } as unknown as DataSource,
      {} as MediaService,
    );
    return { service, row, refresh, manager };
  }

  it.each([SessionParticipantStatus.PRESENT, SessionParticipantStatus.READY])(
    'báo vắng lượt %s: chuyển ABSENT, ghi lý do và cập nhật trạng thái buổi',
    async (status) => {
      const { service, row, refresh, manager } = setup(status);

      await service.absent(actor, 'p1', { reason: 'Ngựa mệt' });

      expect(row.status).toBe(SessionParticipantStatus.ABSENT);
      expect(row.absenceReason).toBe('Ngựa mệt');
      expect(refresh).toHaveBeenCalledWith(manager, 's1');
    },
  );

  it('từ chối báo vắng lượt ONGOING bằng 409 và không lưu gì', async () => {
    const { service, manager, refresh } = setup(
      SessionParticipantStatus.ONGOING,
    );

    await expect(
      service.absent(actor, 'p1', { reason: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (manager as unknown as { save: jest.Mock }).save,
    ).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
