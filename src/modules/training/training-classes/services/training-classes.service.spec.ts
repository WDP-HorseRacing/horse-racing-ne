import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../../common/enums/role.enum';
import type { Actor } from '../../../../common/types/actor';
import type { ClassSessionInputDto } from '../../dto/class-schedule.dto';
import { TrainingClassEntity } from '../../entities/training-class.entity';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
import { TrainingIntensity } from '../../enums/training-intensity.enum';
import { TrainingSessionType } from '../../enums/training-session-type.enum';
import { TrainingAccessService } from '../../shared/training-access.service';
import { TrainingClassesService } from './training-classes.service';

const actor: Actor = { sub: 'ht', roles: [UserRole.HEAD_TRAINER] };

function setup(
  lockedClass: Partial<TrainingClassEntity> = {},
  sameCodeClass: Partial<TrainingClassEntity> | null = null,
) {
  const manager = {
    findOneBy: jest.fn().mockResolvedValue(sameCodeClass),
    findOne: jest.fn().mockResolvedValue({
      id: 'p1',
      headTrainerId: 'ht',
      phases: [{ position: 1, weeks: 4, subjects: [] }],
    }),
    findBy: jest
      .fn()
      .mockResolvedValue([
        { id: 'sub1', sessionType: TrainingSessionType.REGULAR },
      ]),
    create: jest.fn((_target: unknown, row: object) => row),
    save: jest.fn((row: unknown) => Promise.resolve(row)),
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
      status: TrainingClassStatus.DRAFT,
      headTrainerId: 'ht',
      ...lockedClass,
    }),
    assertCanManageClass: jest.fn(),
  };
  const service = new TrainingClassesService(
    {
      findOneBy: jest.fn().mockResolvedValue(sameCodeClass),
    } as unknown as Repository<TrainingClassEntity>,
    access as unknown as TrainingAccessService,
    dataSource,
    { record: jest.fn() },
  );
  return { service, manager };
}

const session = (start: string, end: string): ClassSessionInputDto => ({
  subjectId: 'sub1',
  name: 'Buổi',
  intensity: TrainingIntensity.MODERATE,
  plannedDistanceM: 3000,
  scheduledStartAt: start,
  scheduledEndAt: end,
});

describe('TrainingClassesService.create', () => {
  const create = (
    service: TrainingClassesService,
    sessions: ClassSessionInputDto[],
  ) =>
    service.create(actor, {
      code: 'k1',
      name: 'K1',
      planId: 'p1',
      startDate: '2026-10-05',
      sessions,
    });

  it('trả 409 và không lưu gì khi hai buổi trong danh sách trùng giờ', async () => {
    const { service, manager } = setup();

    await expect(
      create(service, [
        session('2026-10-07T01:30:00.000Z', '2026-10-07T02:30:00.000Z'),
        session('2026-10-06T01:00:00.000Z', '2026-10-06T02:00:00.000Z'),
        session('2026-10-07T01:00:00.000Z', '2026-10-07T02:00:00.000Z'),
      ]),
    ).rejects.toThrow(
      new ConflictException(
        'Trùng giờ với buổi tập lúc 08:00 ngày 07/10/2026 của lớp',
      ),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('nhận các buổi nối tiếp nhau', async () => {
    const { service, manager } = setup();

    await create(service, [
      session('2026-10-06T02:00:00.000Z', '2026-10-06T03:00:00.000Z'),
      session('2026-10-06T01:00:00.000Z', '2026-10-06T02:00:00.000Z'),
    ]);

    expect(manager.save).toHaveBeenCalledTimes(3);
  });
});

describe('TrainingClassesService.updateStatus', () => {
  it('trả 409 khi kích hoạt lớp chưa có Huấn luyện viên trưởng', async () => {
    const { service } = setup({ headTrainerId: null });

    await expect(
      service.updateStatus(actor, 'c1', { status: TrainingClassStatus.ACTIVE }),
    ).rejects.toThrow(
      new ConflictException(
        'Phải phân công Huấn luyện viên trưởng trước khi kích hoạt lớp',
      ),
    );
  });
});

describe('TrainingClassesService duplicate code', () => {
  const codeTaken = (code: string) => ({
    status: 409,
    response: {
      errors: [{ field: 'code', message: `Mã lớp ${code} đã tồn tại` }],
    },
  });

  it('ties a duplicate code on create to the code field', async () => {
    const { service } = setup({}, { id: 'other' });

    await expect(
      service.create(actor, {
        code: 'k1',
        name: 'K1',
        planId: 'p1',
        startDate: '2026-10-05',
        sessions: [],
      }),
    ).rejects.toMatchObject(codeTaken('K1'));
  });

  it('ties a duplicate code on update to the code field', async () => {
    const { service } = setup({ code: 'K1' }, { id: 'other' });

    await expect(
      service.update(actor, 'c1', { code: 'k2' }),
    ).rejects.toMatchObject(codeTaken('K2'));
  });
});
