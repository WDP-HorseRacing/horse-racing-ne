import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import { UserRole } from '../../../../common/enums/role.enum';
import type { MediaService } from '../../../media/services/media.service';
import { HorseLifecycleStatus } from '../../../horses/enums/horse-status.enum';
import { HorseEnrollmentStatus } from '../../enums/horse-enrollment-status.enum';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { SessionParticipantStatus } from '../../enums/session-participant-status.enum';
import { HorseEnrollmentEntity } from '../../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { TrainingAccessService } from '../../shared/training-access.service';
import { TrainingOperationsFacade } from '../../shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from './training-class-enrollments.service';

const actor: Actor = { sub: 'ht', roles: [UserRole.HEAD_TRAINER] };
const LEFT_AT = '2026-10-01T08:00:00.000Z';

function buildEnrollment(status = HorseEnrollmentStatus.ACTIVE) {
  return {
    id: 'e1',
    classId: 'c1',
    horseId: 'h1',
    enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    leftAt: null as Date | null,
    status,
    trainingClass: { headTrainerId: 'ht', endDate: '2026-12-31' },
  };
}

function setup(
  enrollment: ReturnType<typeof buildEnrollment>,
  participants: Array<Record<string, unknown>>,
) {
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(participants),
  };
  const save = jest.fn((...args: unknown[]) =>
    Promise.resolve(args.length === 1 ? args[0] : args[1]),
  );
  const manager = {
    findOne: jest.fn().mockResolvedValue(enrollment),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save,
    getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;
  const access = {
    currentUser: jest.fn().mockResolvedValue({ id: 'ht' }),
    assertCanManageClass: jest.fn(),
    findTrainingClass: jest.fn().mockResolvedValue(enrollment.trainingClass),
    lockedTrainingClass: jest.fn().mockResolvedValue({
      id: 'c1',
      status: TrainingClassStatus.ACTIVE,
      maxHorses: 0,
      headTrainerId: 'ht',
      startDate: '2026-01-01',
      endDate: '2027-12-31',
    }),
    lockedHorse: jest.fn().mockResolvedValue({
      id: 'h1',
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    }),
    assertTrainerBarn: jest.fn(),
  };
  const operations = new TrainingOperationsFacade();
  const refresh = jest
    .spyOn(operations, 'refreshSessionStatus')
    .mockResolvedValue({} as never);
  const service = new TrainingClassEnrollmentsService(
    {} as Repository<HorseEnrollmentEntity>,
    access as unknown as TrainingAccessService,
    operations,
    dataSource,
    {} as MediaService,
  );
  return { service, qb, save, access, refresh, manager };
}

describe('TrainingClassEnrollmentsService.leave', () => {
  it('marks the enrollment LEFT and cancels open participants from leftAt', async () => {
    const enrollment = buildEnrollment();
    const participants = [
      {
        id: 'p1',
        sessionId: 's1',
        status: SessionParticipantStatus.PLANNED,
        cancelReason: null,
      },
      {
        id: 'p2',
        sessionId: 's2',
        status: SessionParticipantStatus.READY,
        cancelReason: null,
      },
    ];
    const { service, qb, save, refresh, manager } = setup(
      enrollment,
      participants,
    );

    await service.leave(actor, 'e1', {
      leftAt: LEFT_AT,
      reason: 'Chấn thương',
    });

    expect(enrollment.status).toBe(HorseEnrollmentStatus.LEFT);
    expect(enrollment.leftAt).toEqual(new Date(LEFT_AT));
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('participant.horse_enrollment_id'),
      expect.objectContaining({}),
    );
    const whereCalls = qb.where.mock.calls as Array<[string, object]>;
    expect(JSON.stringify(whereCalls[0][1])).toContain('e1');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'participant.status IN (:...statuses)',
      {
        statuses: [
          SessionParticipantStatus.PLANNED,
          SessionParticipantStatus.PRESENT,
          SessionParticipantStatus.READY,
        ],
      },
    );
    const andWhereCalls = qb.andWhere.mock.calls as Array<[string, object]>;
    const timeFilter = andWhereCalls.find(([sql]) =>
      sql.startsWith('session.scheduled_start_at >= :'),
    );
    expect(Object.values(timeFilter?.[1] ?? {})).toEqual([new Date(LEFT_AT)]);
    for (const row of participants) {
      expect(row.status).toBe(SessionParticipantStatus.CANCELLED);
      expect(row.cancelReason).toBe('Chấn thương');
    }
    expect(save).toHaveBeenCalledWith(SessionParticipantEntity, participants);
    expect(refresh).toHaveBeenCalledWith(manager, 's1');
    expect(refresh).toHaveBeenCalledWith(manager, 's2');
  });

  it('uses the default reason when none is given', async () => {
    const participants = [
      {
        id: 'p1',
        sessionId: 's1',
        status: SessionParticipantStatus.PLANNED,
        cancelReason: null,
      },
    ];
    const { service } = setup(buildEnrollment(), participants);

    await service.leave(actor, 'e1', { leftAt: LEFT_AT });

    expect(participants[0].cancelReason).toBe('Horse đã rời class');
  });

  it('returns 409 when the enrollment already left the class', async () => {
    const { service, save } = setup(
      buildEnrollment(HorseEnrollmentStatus.LEFT),
      [],
    );

    await expect(
      service.leave(actor, 'e1', { leftAt: LEFT_AT }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns 403 and changes nothing when the caller cannot manage the class', async () => {
    const { service, access, save } = setup(buildEnrollment(), []);
    access.assertCanManageClass.mockImplementation(() => {
      throw new ForbiddenException();
    });

    await expect(
      service.leave(actor, 'e1', { leftAt: LEFT_AT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('TrainingClassEnrollmentsService.create', () => {
  it.each([HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED])(
    'refuses to enroll a %s horse with 409 and saves nothing',
    async (lifecycleStatus) => {
      const { service, access, save } = setup(buildEnrollment(), []);
      access.lockedHorse.mockResolvedValue({ id: 'h1', lifecycleStatus });

      await expect(
        service.create(actor, 'c1', { horseId: 'h1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(save).not.toHaveBeenCalled();
    },
  );

  describe('enrolledAt theo ngày lịch CLB', () => {
    const club = {
      id: 'c1',
      status: TrainingClassStatus.ACTIVE,
      maxHorses: 0,
      headTrainerId: 'ht',
      startDate: '2026-10-05',
      endDate: '2026-10-10',
    };

    it.each([
      ['06:30 giờ VN ngày khai giảng', '2026-10-04T23:30:00.000Z'],
      ['00:00 giờ VN ngày khai giảng', '2026-10-04T17:00:00.000Z'],
      ['23:59 giờ VN ngày kết thúc', '2026-10-10T16:59:00.000Z'],
    ])('nhận ghi danh lúc %s', async (_label, enrolledAt) => {
      const { service, access, save } = setup(buildEnrollment(), []);
      access.lockedTrainingClass.mockResolvedValue(club);
      jest
        .spyOn(
          service as unknown as {
            addToFuturePublishedSessions: () => Promise<void>;
          },
          'addToFuturePublishedSessions',
        )
        .mockResolvedValue();

      await service.create(actor, 'c1', { horseId: 'h1', enrolledAt });

      expect(save).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['23:59:59 giờ VN trước ngày khai giảng', '2026-10-04T16:59:59.000Z'],
      ['00:00 giờ VN ngày sau ngày kết thúc', '2026-10-10T17:00:00.000Z'],
    ])('từ chối ghi danh lúc %s bằng 409', async (_label, enrolledAt) => {
      const { service, access, save } = setup(buildEnrollment(), []);
      access.lockedTrainingClass.mockResolvedValue(club);

      await expect(
        service.create(actor, 'c1', { horseId: 'h1', enrolledAt }),
      ).rejects.toThrow('Thời điểm ghi danh phải nằm trong thời gian của lớp');
      expect(save).not.toHaveBeenCalled();
    });
  });
});

describe('TrainingClassEnrollmentsService.leave theo ngày lịch CLB', () => {
  function enrollmentEndingOn(endDate: string) {
    const enrollment = buildEnrollment();
    enrollment.trainingClass = { headTrainerId: 'ht', endDate };
    return enrollment;
  }

  it('nhận leftAt lúc 23:59 giờ VN ngày kết thúc', async () => {
    const { service } = setup(enrollmentEndingOn('2026-12-31'), []);

    await expect(
      service.leave(actor, 'e1', { leftAt: '2026-12-31T16:59:00.000Z' }),
    ).resolves.toBeDefined();
  });

  it('từ chối leftAt lúc 00:00 giờ VN ngày sau ngày kết thúc bằng 409', async () => {
    const { service, save } = setup(enrollmentEndingOn('2026-12-31'), []);

    await expect(
      service.leave(actor, 'e1', { leftAt: '2026-12-31T17:00:00.000Z' }),
    ).rejects.toThrow('Thời điểm rời lớp phải nằm trong thời gian của lớp');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('TrainingClassEnrollmentsService.list', () => {
  const rows = [
    { ...buildEnrollment(), id: 'e1', horseId: 'h1' },
    { ...buildEnrollment(), id: 'e2', horseId: 'h2' },
    { ...buildEnrollment(), id: 'e3', horseId: 'h3' },
  ];

  function build(canRead: (row: { id: string }) => boolean) {
    const access = {
      currentUser: jest.fn().mockResolvedValue({ id: 'ht' }),
      assertCanReadClass: jest.fn().mockResolvedValue(undefined),
      canReadEnrollment: jest.fn(
        (_actor: Actor, _callerId: string, row: { id: string }) =>
          Promise.resolve(canRead(row)),
      ),
      horseBriefs: jest.fn().mockResolvedValue(
        new Map([
          ['h1', { name: 'Gió', mediaId: 'm1' }],
          ['h2', { name: 'Bão (đã xóa)', mediaId: null }],
          ['h3', { name: 'Mây', mediaId: 'm3' }],
        ]),
      ),
    };
    const media = {
      signDownloadUrls: jest
        .fn()
        .mockResolvedValue(new Map([['m1', 'https://signed/m1']])),
    };
    const service = new TrainingClassEnrollmentsService(
      {
        find: jest.fn().mockResolvedValue(rows),
      } as unknown as Repository<HorseEnrollmentEntity>,
      access as unknown as TrainingAccessService,
      new TrainingOperationsFacade(),
      { manager: {} } as unknown as DataSource,
      media as unknown as MediaService,
    );
    return { service, access, media };
  }

  it('adds horse name and photo url, null when the horse has no photo or it cannot be signed', async () => {
    const { service, access, media } = build(() => true);

    const result = await service.list(actor, 'c1');

    expect(result.map((item) => [item.horseName, item.horsePhotoUrl])).toEqual([
      ['Gió', 'https://signed/m1'],
      ['Bão (đã xóa)', null],
      ['Mây', null],
    ]);
    expect(access.horseBriefs).toHaveBeenCalledTimes(1);
    expect(access.horseBriefs).toHaveBeenCalledWith(['h1', 'h2', 'h3']);
    expect(media.signDownloadUrls).toHaveBeenCalledTimes(1);
    expect(media.signDownloadUrls).toHaveBeenCalledWith(['m1', 'm3']);
  });

  it('looks up names and signs photos only for the enrollments the caller can see', async () => {
    const { service, access } = build((row) => row.id === 'e1');

    const result = await service.list(actor, 'c1');

    expect(result.map((item) => item.id)).toEqual(['e1']);
    expect(access.horseBriefs).toHaveBeenCalledWith(['h1']);
  });
});
