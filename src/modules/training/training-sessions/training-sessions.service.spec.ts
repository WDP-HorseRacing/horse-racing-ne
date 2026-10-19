import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreateTrainingSessionDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingClassPhaseEntity } from '../entities/training-class-phase.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrainingSessionsService } from './training-sessions.service';

const actor: Actor = { sub: 'ht', roles: [UserRole.HEAD_TRAINER] };

function setup() {
  const session = {
    id: 's1',
    classId: 'c1',
    subjectId: null,
    name: 'Buổi 1',
    sessionType: TrainingSessionType.REGULAR,
    intensity: TrainingIntensity.HEAVY,
    plannedDistanceM: 3000,
    targetTimeMs: null as number | null,
    scheduledStartAt: new Date('2099-10-10T01:00:00.000Z'),
    scheduledEndAt: new Date('2099-10-10T02:00:00.000Z'),
    location: 'Sân A',
    surface: 'Cỏ',
    notes: 'Ghi chú cũ',
    status: TrainingSessionStatus.SCHEDULED,
  };
  const save = jest.fn((row: unknown) => Promise.resolve(row));
  const manager = {
    save,
    existsBy: jest.fn().mockResolvedValue(false),
    find: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn(() => ({
      createQueryBuilder: () => {
        const qb = {
          where: () => qb,
          andWhere: () => qb,
          orderBy: () => qb,
          getMany: () => Promise.resolve([]),
        };
        return qb;
      },
    })),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;
  const access = {
    currentUser: jest.fn().mockResolvedValue({ id: 'ht' }),
    lockedSession: jest.fn().mockResolvedValue(session),
    lockedTrainingClass: jest.fn().mockResolvedValue({
      id: 'c1',
      status: TrainingClassStatus.ACTIVE,
      headTrainerId: 'ht',
      startDate: '2099-10-01',
      endDate: '2099-10-31',
    }),
    assertCanManageClass: jest.fn(),
    groomRunClashes: jest.fn().mockResolvedValue([]),
    lockUsers: jest.fn(),
    headTrainerSessions: jest.fn().mockResolvedValue([]),
  };
  const service = new TrainingSessionsService(
    {} as Repository<TrainingSessionEntity>,
    access as unknown as TrainingAccessService,
    dataSource,
    { record: jest.fn() },
    { publish: jest.fn() },
  );
  return { service, session, manager, save, access };
}

describe('TrainingSessionsService.updateSession', () => {
  it('gửi null thì xóa location, surface, notes', async () => {
    const { service } = setup();

    const result = await service.updateSession(actor, 's1', {
      location: null,
      surface: null,
      notes: null,
    });

    expect(result.location).toBeNull();
    expect(result.surface).toBeNull();
    expect(result.notes).toBeNull();
  });

  it('không gửi thì giữ nguyên location, surface, notes', async () => {
    const { service } = setup();

    const result = await service.updateSession(actor, 's1', { name: 'Mới' });

    expect(result.name).toBe('Mới');
    expect(result.location).toBe('Sân A');
    expect(result.surface).toBe('Cỏ');
    expect(result.notes).toBe('Ghi chú cũ');
  });

  it('gửi chuỗi thì ghi đè', async () => {
    const { service } = setup();

    const result = await service.updateSession(actor, 's1', {
      location: 'Sân B',
    });

    expect(result.location).toBe('Sân B');
    expect(result.surface).toBe('Cỏ');
  });

  it('trả 409 khi đổi giờ trùng buổi ở lớp khác của Head Trainer, không lưu', async () => {
    const { service, manager, save, access } = setup();
    access.headTrainerSessions.mockResolvedValue([busyOfHeadTrainer]);

    await expect(
      service.updateSession(actor, 's1', {
        scheduledStartAt: '2099-10-11T01:00:00.000Z',
        scheduledEndAt: '2099-10-11T02:00:00.000Z',
      }),
    ).rejects.toThrow(headTrainerClash);
    expect(access.lockUsers).toHaveBeenCalledWith(manager, ['ht']);
    expect(access.headTrainerSessions).toHaveBeenCalledWith(
      manager,
      ['ht'],
      new Date('2099-10-11T01:00:00.000Z'),
      new Date('2099-10-11T02:00:00.000Z'),
      'c1',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('không kiểm lịch Head Trainer khi không đổi giờ', async () => {
    const { service, access } = setup();
    access.headTrainerSessions.mockResolvedValue([busyOfHeadTrainer]);

    await service.updateSession(actor, 's1', {
      intensity: TrainingIntensity.LIGHT,
    });

    expect(access.headTrainerSessions).not.toHaveBeenCalled();
  });
});

const busyOfHeadTrainer = {
  sessionId: 's9',
  classId: 'c9',
  classCode: 'K9',
  headTrainerId: 'ht',
  scheduledStartAt: new Date('2099-10-11T00:30:00.000Z'),
  scheduledEndAt: new Date('2099-10-11T01:30:00.000Z'),
};

const headTrainerClash = new ConflictException(
  'Trùng giờ với lịch của Huấn luyện viên trưởng: lớp K9, 07:30 ngày 11/10/2099',
);

describe('UpdateTrainingSessionDto', () => {
  it('chấp nhận null ở location, surface, notes', async () => {
    const dto = plainToInstance(UpdateTrainingSessionDto, {
      location: null,
      surface: null,
      notes: null,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});

function setupCreate(
  subject: { id: string; sessionType: TrainingSessionType } | null,
) {
  const manager = {
    findOneBy: jest.fn().mockResolvedValue(subject),
    find: jest.fn((target: unknown) =>
      Promise.resolve(
        target === TrainingClassPhaseEntity && subject
          ? [{ position: 1, weeks: 52, subjects: [{ subjectId: subject.id }] }]
          : [],
      ),
    ),
    create: jest.fn((target: unknown, row: object) => ({ target, ...row })),
    save: jest.fn((row: object) => Promise.resolve({ id: 'new', ...row })),
    getRepository: jest.fn(() => ({
      createQueryBuilder: () => {
        const qb = {
          where: () => qb,
          andWhere: () => qb,
          orderBy: () => qb,
          getMany: () => Promise.resolve([]),
        };
        return qb;
      },
    })),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      cb(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const access = {
    currentUser: jest.fn().mockResolvedValue({ id: 'ht' }),
    lockedTrainingClass: jest.fn().mockResolvedValue({
      id: 'c1',
      status: TrainingClassStatus.ACTIVE,
      headTrainerId: 'ht',
      startDate: '2099-10-01',
      endDate: '2099-10-31',
    }),
    assertCanManageClass: jest.fn(),
    groomRunClashes: jest.fn().mockResolvedValue([]),
    lockUsers: jest.fn(),
    headTrainerSessions: jest.fn().mockResolvedValue([]),
  };
  const service = new TrainingSessionsService(
    {} as Repository<TrainingSessionEntity>,
    access as unknown as TrainingAccessService,
    dataSource,
    { record: jest.fn() },
    { publish: jest.fn() },
  );
  return { service, manager, access };
}

const newSession = (
  overrides: Partial<CreateTrainingSessionDto> = {},
): CreateTrainingSessionDto => ({
  subjectId: 'sub1',
  name: 'Buổi mới',
  intensity: TrainingIntensity.HEAVY,
  plannedDistanceM: 1200,
  scheduledStartAt: '2099-10-10T01:00:00.000Z',
  scheduledEndAt: '2099-10-10T02:00:00.000Z',
  ...overrides,
});

describe('TrainingSessionsService.createSession', () => {
  const trial = { id: 'sub1', sessionType: TrainingSessionType.TIME_TRIAL };
  const regular = { id: 'sub1', sessionType: TrainingSessionType.REGULAR };

  it('trả 400 khi môn học không tồn tại', async () => {
    const { service, manager } = setupCreate(null);

    await expect(
      service.createSession(actor, 'c1', newSession()),
    ).rejects.toThrow(new BadRequestException('Môn học không tồn tại'));
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('trả 400 gắn ô sessionType khi loại buổi gửi lên khác loại của môn', async () => {
    const { service, manager } = setupCreate(trial);

    const error = await service
      .createSession(
        actor,
        'c1',
        newSession({ sessionType: TrainingSessionType.REGULAR }),
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Loại buổi phải trùng với loại buổi của môn học',
      errors: [
        {
          field: 'sessionType',
          message: 'Loại buổi phải trùng với loại buổi của môn học',
        },
      ],
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('trả 400 khi buổi thường có thời gian mục tiêu', async () => {
    const { service, manager } = setupCreate(regular);

    await expect(
      service.createSession(actor, 'c1', newSession({ targetTimeMs: 62000 })),
    ).rejects.toThrow(
      new BadRequestException('Chỉ môn chạy thử mới có thời gian mục tiêu'),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('trả 400 khi buổi chạy thử có cự ly 0', async () => {
    const { service, manager } = setupCreate(trial);

    await expect(
      service.createSession(actor, 'c1', newSession({ plannedDistanceM: 0 })),
    ).rejects.toThrow(
      new BadRequestException('Môn chạy thử phải có cự ly lớn hơn 0'),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('lấy loại buổi theo môn và lưu thời gian mục tiêu vào buổi', async () => {
    const { service, manager } = setupCreate(trial);

    const created = await service.createSession(
      actor,
      'c1',
      newSession({ targetTimeMs: 62000 }),
    );

    expect(created.sessionType).toBe(TrainingSessionType.TIME_TRIAL);
    expect(created.targetTimeMs).toBe(62000);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('buổi thường không có thời gian mục tiêu', async () => {
    const { service } = setupCreate(regular);

    const created = await service.createSession(actor, 'c1', newSession());

    expect(created.sessionType).toBe(TrainingSessionType.REGULAR);
    expect(created.targetTimeMs).toBeNull();
  });

  it('trả 409 khi trùng buổi ở lớp khác của Head Trainer, không lưu', async () => {
    const { service, manager, access } = setupCreate(regular);
    access.headTrainerSessions.mockResolvedValue([
      {
        ...busyOfHeadTrainer,
        scheduledStartAt: new Date('2099-10-10T00:30:00.000Z'),
        scheduledEndAt: new Date('2099-10-10T01:30:00.000Z'),
      },
    ]);

    await expect(
      service.createSession(actor, 'c1', newSession()),
    ).rejects.toThrow(
      new ConflictException(
        'Trùng giờ với lịch của Huấn luyện viên trưởng: lớp K9, 07:30 ngày 10/10/2099',
      ),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('bỏ qua lịch Head Trainer khi lớp chưa có Head Trainer', async () => {
    const { service, access } = setupCreate(regular);
    access.lockedTrainingClass.mockResolvedValue({
      id: 'c1',
      status: TrainingClassStatus.ACTIVE,
      headTrainerId: null,
      startDate: '2099-10-01',
      endDate: '2099-10-31',
    });

    await service.createSession(actor, 'c1', newSession());

    expect(access.headTrainerSessions).not.toHaveBeenCalled();
  });
});

const pastStart = {
  status: 400,
  response: {
    errors: [
      {
        field: 'scheduledStartAt',
        message: 'Giờ bắt đầu buổi tập phải sau thời điểm hiện tại',
      },
    ],
  },
};

const pastClass = {
  id: 'c1',
  status: TrainingClassStatus.ACTIVE,
  headTrainerId: 'ht',
  startDate: '2000-01-01',
  endDate: '2099-12-31',
};

const pastWindow = {
  scheduledStartAt: '2000-01-10T01:00:00.000Z',
  scheduledEndAt: '2000-01-10T02:00:00.000Z',
};

describe('TrainingSessionsService scheduling in the past', () => {
  const regular = { id: 'sub1', sessionType: TrainingSessionType.REGULAR };

  it('trả 400 gắn ô scheduledStartAt khi thêm buổi đã qua giờ bắt đầu, không lưu', async () => {
    const { service, manager, access } = setupCreate(regular);
    access.lockedTrainingClass.mockResolvedValue(pastClass);

    await expect(
      service.createSession(actor, 'c1', newSession(pastWindow)),
    ).rejects.toMatchObject(pastStart);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('vẫn trả 409 trùng lịch Head Trainer trước lỗi giờ quá khứ', async () => {
    const { service, access } = setupCreate(regular);
    access.lockedTrainingClass.mockResolvedValue(pastClass);
    access.headTrainerSessions.mockResolvedValue([
      {
        ...busyOfHeadTrainer,
        scheduledStartAt: new Date('2000-01-10T00:30:00.000Z'),
        scheduledEndAt: new Date('2000-01-10T01:30:00.000Z'),
      },
    ]);

    await expect(
      service.createSession(actor, 'c1', newSession(pastWindow)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('thêm nhiều buổi: buổi đã qua giờ báo lỗi ở sessions.{i}.scheduledStartAt, không lưu buổi nào', async () => {
    const { service, manager, access } = setupCreate(regular);
    access.lockedTrainingClass.mockResolvedValue(pastClass);
    const message = 'Buổi 2: Giờ bắt đầu buổi tập phải sau thời điểm hiện tại';

    await expect(
      service.createSessions(actor, 'c1', {
        sessions: [newSession(), newSession(pastWindow)],
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        message,
        errors: [{ field: 'sessions.1.scheduledStartAt', message }],
      },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('trả 400 khi đổi giờ bắt đầu sang quá khứ, không lưu', async () => {
    const { service, save, access } = setup();
    access.lockedTrainingClass.mockResolvedValue(pastClass);

    await expect(
      service.updateSession(actor, 's1', pastWindow),
    ).rejects.toMatchObject(pastStart);
    expect(save).not.toHaveBeenCalled();
  });

  it('cho đổi giờ bắt đầu sang tương lai', async () => {
    const { service } = setup();

    const result = await service.updateSession(actor, 's1', {
      scheduledStartAt: '2099-10-11T01:00:00.000Z',
      scheduledEndAt: '2099-10-11T02:00:00.000Z',
    });

    expect(result.scheduledStartAt).toEqual(
      new Date('2099-10-11T01:00:00.000Z'),
    );
  });
});

function setupSubjectSwitch(
  current: { sessionType: TrainingSessionType; targetTimeMs: number | null },
  next: { id: string; sessionType: TrainingSessionType },
) {
  const ctx = setup();
  Object.assign(ctx.session, { subjectId: 'old', ...current });
  Object.assign(ctx.manager, {
    findOneBy: jest.fn().mockResolvedValue(next),
    find: jest.fn((target: unknown) =>
      Promise.resolve(
        target === TrainingClassPhaseEntity
          ? [{ position: 1, weeks: 52, subjects: [{ subjectId: next.id }] }]
          : [],
      ),
    ),
  });
  return ctx;
}

describe('TrainingSessionsService.updateSession loại buổi theo môn', () => {
  const trial = { id: 'trial', sessionType: TrainingSessionType.TIME_TRIAL };
  const regular = { id: 'regular', sessionType: TrainingSessionType.REGULAR };

  it('đổi buổi thường sang môn chạy thử: buổi thành chạy thử, nhận thời gian mục tiêu', async () => {
    const { service } = setupSubjectSwitch(
      { sessionType: TrainingSessionType.REGULAR, targetTimeMs: null },
      trial,
    );

    const result = await service.updateSession(actor, 's1', {
      subjectId: 'trial',
      targetTimeMs: 62000,
    });

    expect(result.sessionType).toBe(TrainingSessionType.TIME_TRIAL);
    expect(result.targetTimeMs).toBe(62000);
  });

  it('đổi buổi chạy thử sang môn thường: buổi thành buổi thường, bỏ thời gian mục tiêu', async () => {
    const { service } = setupSubjectSwitch(
      { sessionType: TrainingSessionType.TIME_TRIAL, targetTimeMs: 62000 },
      regular,
    );

    const result = await service.updateSession(actor, 's1', {
      subjectId: 'regular',
    });

    expect(result.sessionType).toBe(TrainingSessionType.REGULAR);
    expect(result.targetTimeMs).toBeNull();
  });

  it('buổi chạy thử đổi cự ly giữ thời gian mục tiêu cũ', async () => {
    const { service } = setupSubjectSwitch(
      { sessionType: TrainingSessionType.TIME_TRIAL, targetTimeMs: 62000 },
      trial,
    );

    const result = await service.updateSession(actor, 's1', {
      plannedDistanceM: 1600,
    });

    expect(result.plannedDistanceM).toBe(1600);
    expect(result.targetTimeMs).toBe(62000);
  });

  it('trả 400 khi đổi sang môn thường mà gửi thời gian mục tiêu, không lưu', async () => {
    const { service, save } = setupSubjectSwitch(
      { sessionType: TrainingSessionType.TIME_TRIAL, targetTimeMs: 62000 },
      regular,
    );

    await expect(
      service.updateSession(actor, 's1', {
        subjectId: 'regular',
        targetTimeMs: 62000,
      }),
    ).rejects.toThrow(
      new BadRequestException('Chỉ môn chạy thử mới có thời gian mục tiêu'),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('trả 400 khi đổi sang môn chạy thử mà cự ly 0, không lưu', async () => {
    const { service, save, session } = setupSubjectSwitch(
      { sessionType: TrainingSessionType.REGULAR, targetTimeMs: null },
      trial,
    );
    session.plannedDistanceM = 0;

    await expect(
      service.updateSession(actor, 's1', { subjectId: 'trial' }),
    ).rejects.toThrow(
      new BadRequestException('Môn chạy thử phải có cự ly lớn hơn 0'),
    );
    expect(save).not.toHaveBeenCalled();
  });
});
