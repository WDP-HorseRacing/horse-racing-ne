import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { BarnsService } from '../../src/modules/stable/barns/barns.service';
import { BarnEntity } from '../../src/modules/stable/entities/barn.entity';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('BarnsService.update đổi Head Trainer (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: BarnsService;
  let actor: Actor;
  let oldId: string;
  let newId: string;
  let barnId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const horseAccess = new HorseAccessService(dataSource);
    service = new BarnsService(
      dataSource.getRepository(BarnEntity),
      dataSource,
      new StableAccessService(horseAccess),
      new AuditService(),
      new TrainingAccessService(dataSource, horseAccess),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    actor = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
    oldId = await seed.user(UserRole.HEAD_TRAINER);
    newId = await seed.user(UserRole.HEAD_TRAINER);
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [oldId, barnId],
    );
  });

  const enroll = async (
    classId: string,
    horseId: string,
    status = 'ACTIVE',
  ): Promise<void> => {
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, enrolled_at, status)
       VALUES (gen_random_uuid(), 1, $1, $2, now(), $3)`,
      [classId, horseId, status],
    );
  };

  const headTrainerOfBarn = async (): Promise<string> => {
    const [row] = await dataSource.query<Array<{ head_trainer_id: string }>>(
      'SELECT head_trainer_id FROM barns WHERE id = $1',
      [barnId],
    );
    return row.head_trainer_id;
  };

  it('rejects with the class codes when the old head trainer has ACTIVE classes holding horses of the barn', async () => {
    const horse = await seed.horse('Ngựa 1', { barnId });
    const first = await seed.trainingClass(oldId, {
      code: 'LOP-B',
      status: 'ACTIVE',
    });
    const second = await seed.trainingClass(oldId, {
      code: 'LOP-A',
      status: 'ACTIVE',
    });
    await enroll(first.classId, horse);
    await enroll(second.classId, horse);

    await expect(
      service.update(actor, barnId, { headTrainerId: newId }),
    ).rejects.toThrow(
      new ConflictException(
        'Huấn luyện viên trưởng hiện tại còn lớp LOP-A, LOP-B đang có ngựa của khu này. Cho các ngựa rời lớp hoặc hoàn thành lớp trước khi đổi Huấn luyện viên trưởng, hoặc dùng Bàn giao nếu Huấn luyện viên nghỉ.',
      ),
    );
    expect(await headTrainerOfBarn()).toBe(oldId);
  });

  it('allows the change when the only class holding horses of the barn is a DRAFT', async () => {
    const horse = await seed.horse('Ngựa 1', { barnId });
    const draft = await seed.trainingClass(oldId, { status: 'DRAFT' });
    await enroll(draft.classId, horse);

    await service.update(actor, barnId, { headTrainerId: newId });

    expect(await headTrainerOfBarn()).toBe(newId);
  });

  it('allows the change when the ACTIVE class only holds horses of another barn', async () => {
    const otherBarn = await seed.barn('Khu B');
    const horse = await seed.horse('Ngựa khác khu', { barnId: otherBarn });
    const running = await seed.trainingClass(oldId, { status: 'ACTIVE' });
    await enroll(running.classId, horse);

    await service.update(actor, barnId, { headTrainerId: newId });

    expect(await headTrainerOfBarn()).toBe(newId);
  });

  it('allows the change when the enrollment of the barn horse already LEFT', async () => {
    const horse = await seed.horse('Ngựa 1', { barnId });
    const running = await seed.trainingClass(oldId, { status: 'ACTIVE' });
    await enroll(running.classId, horse, 'LEFT');

    await service.update(actor, barnId, { headTrainerId: newId });

    expect(await headTrainerOfBarn()).toBe(newId);
  });

  it('ignores horses that are soft-deleted', async () => {
    const horse = await seed.horse('Ngựa đã xóa', { barnId, deleted: true });
    const running = await seed.trainingClass(oldId, { status: 'ACTIVE' });
    await enroll(running.classId, horse);

    await service.update(actor, barnId, { headTrainerId: newId });

    expect(await headTrainerOfBarn()).toBe(newId);
  });

  it('ignores ACTIVE classes of a head trainer who is not the barn head trainer', async () => {
    const horse = await seed.horse('Ngựa 1', { barnId });
    const other = await seed.trainingClass(newId, { status: 'ACTIVE' });
    await enroll(other.classId, horse);

    await service.update(actor, barnId, { headTrainerId: newId });

    expect(await headTrainerOfBarn()).toBe(newId);
  });
});
