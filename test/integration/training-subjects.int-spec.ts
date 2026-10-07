import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingSubjectsService } from '../../src/modules/training/training-subjects/training-subjects.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('TrainingSubjectsService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: TrainingSubjectsService;
  let manager: Actor;

  const endurance = {
    name: 'Sức bền',
    sessionType: TrainingSessionType.REGULAR,
    intensity: TrainingIntensity.MODERATE,
    plannedDistanceM: 4000,
    surface: 'Cát',
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new TrainingSubjectsService(
      dataSource.getRepository(TrainingSubjectEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const id = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    manager = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
  });

  it('creates subjects and lists them by name', async () => {
    await service.create(manager, endurance);
    await service.create(manager, {
      name: 'Chạy thử 1200',
      sessionType: TrainingSessionType.TIME_TRIAL,
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1200,
      targetTimeMs: 75000,
    });

    const rows = await service.list();

    expect(rows.map((row) => row.name)).toEqual(['Chạy thử 1200', 'Sức bền']);
    expect(rows[0]).toMatchObject({ targetTimeMs: 75000, surface: null });
  });

  it('rejects a duplicate subject name with 409', async () => {
    await service.create(manager, endurance);

    await expect(service.create(manager, endurance)).rejects.toThrow(
      new ConflictException('Tên môn học đã tồn tại'),
    );
  });

  it('keeps unsent fields on update and clears a field sent as null', async () => {
    const created = await service.create(manager, endurance);

    const updated = await service.update(manager, created.id, {
      plannedDistanceM: 5000,
      surface: null as unknown as string,
    });

    expect(updated).toMatchObject({
      name: 'Sức bền',
      intensity: TrainingIntensity.MODERATE,
      plannedDistanceM: 5000,
      surface: null,
    });
  });

  it('checks the merged subject when switching a time trial to regular', async () => {
    const trial = await service.create(manager, {
      name: 'Chạy thử 1200',
      sessionType: TrainingSessionType.TIME_TRIAL,
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1200,
      targetTimeMs: 75000,
    });

    await expect(
      service.update(manager, trial.id, {
        sessionType: TrainingSessionType.REGULAR,
      }),
    ).rejects.toThrow('Chỉ môn chạy thử mới có thời gian mục tiêu');
  });

  it('deletes a subject and returns 404 for a missing one', async () => {
    const created = await service.create(manager, endurance);

    await service.remove(manager, created.id);

    await expect(service.get(created.id)).rejects.toThrow(NotFoundException);
    await expect(service.remove(manager, created.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
