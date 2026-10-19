import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../../common/enums/role.enum';
import type { Actor } from '../../../../common/types/actor';
import { clubToday, shiftDays } from '../../../../common/utils/club-date';
import { UpdateTrainingClassStatusDto } from '../../dto/training-class.dto';
import { TrainingClassEntity } from '../../entities/training-class.entity';
import { TrainingClassStatus } from '../../enums/training-class-status.enum';
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
    findBy: jest.fn().mockResolvedValue([{ weeks: 4 }]),
    countBy: jest.fn().mockResolvedValue(0),
    getRepository: jest.fn(() => ({
      createQueryBuilder: () => {
        const qb = {
          where: () => qb,
          andWhere: () => qb,
          getCount: () => Promise.resolve(0),
        };
        return qb;
      },
    })),
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
      status: TrainingClassStatus.ACTIVE,
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

describe('TrainingClassesService start date in the past', () => {
  const pastStart = {
    status: 400,
    response: {
      errors: [
        { field: 'startDate', message: 'Ngày bắt đầu không được ở quá khứ' },
      ],
    },
  };
  const newClass = (startDate: string) => ({
    code: 'k1',
    name: 'K1',
    planId: 'p1',
    startDate,
  });

  it('trả 400 gắn ô startDate khi tạo lớp bắt đầu hôm qua, không lưu', async () => {
    const { service, manager } = setup();

    await expect(
      service.create(actor, newClass(shiftDays(clubToday(), -1))),
    ).rejects.toMatchObject(pastStart);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('cho tạo lớp bắt đầu hôm nay', async () => {
    const { service } = setup();

    const created = await service.create(actor, newClass(clubToday()));

    expect(created.startDate).toBe(clubToday());
  });

  it('trả 400 khi dời ngày bắt đầu sang quá khứ, không lưu', async () => {
    const { service, manager } = setup({
      startDate: '2099-10-01',
      endDate: '2099-10-28',
    });

    await expect(
      service.update(actor, 'c1', { startDate: '2000-01-01' }),
    ).rejects.toMatchObject(pastStart);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('cho sửa lớp đã bắt đầu từ trước khi gửi lại đúng ngày bắt đầu cũ', async () => {
    const { service } = setup({
      startDate: '2000-01-01',
      endDate: '2000-01-28',
    });

    const updated = await service.update(actor, 'c1', {
      startDate: '2000-01-01',
      name: 'Tên mới',
    });

    expect(updated.name).toBe('Tên mới');
    expect(updated.startDate).toBe('2000-01-01');
  });
});

describe('UpdateTrainingClassStatusDto', () => {
  it('only accepts completing or cancelling a class', async () => {
    const errorsOf = (status: string) =>
      validate(
        plainToInstance(UpdateTrainingClassStatusDto, {
          status,
          cancelReason: 'x',
        }),
      );

    await expect(errorsOf('COMPLETED')).resolves.toEqual([]);
    await expect(errorsOf('CANCELLED')).resolves.toEqual([]);
    for (const status of ['ACTIVE', 'DRAFT']) {
      expect((await errorsOf(status)).map((e) => e.property)).toEqual([
        'status',
      ]);
    }
  });
});
