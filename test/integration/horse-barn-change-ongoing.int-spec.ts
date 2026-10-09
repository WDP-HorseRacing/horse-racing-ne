import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorsePlacementsRepository } from '../../src/modules/horses/horse-placements/horse-placements.repository';
import { HorsePlacementsService } from '../../src/modules/horses/horse-placements/horse-placements.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { BarnsService } from '../../src/modules/stable/barns/barns.service';
import { BarnEntity } from '../../src/modules/stable/entities/barn.entity';
import { StallAssignmentEntity } from '../../src/modules/stable/entities/stall-assignment.entity';
import { StallEntity } from '../../src/modules/stable/entities/stall.entity';
import { GroomAssignmentsService } from '../../src/modules/stable/groom-assignments/groom-assignments.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { StallsService } from '../../src/modules/stable/stalls/stalls.service';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Đổi khu của ngựa đang có lượt tập (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: HorsePlacementsService;
  let actor: Actor;
  let trainerA: string;
  let trainerB: string;
  let barnA: string;
  let barnOtherTrainer: string;
  let barnSameTrainer: string;
  let horseId: string;
  let classId: string;
  let enrollmentId: string;
  let sessionId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const horseAccess = new HorseAccessService(dataSource);
    const stableAccess = new StableAccessService(horseAccess);
    const audit = new AuditService();
    service = new HorsePlacementsService(
      horseAccess,
      new BarnsService(
        dataSource.getRepository(BarnEntity),
        dataSource,
        stableAccess,
        audit,
        new TrainingAccessService(dataSource, horseAccess),
      ),
      new StallsService(
        dataSource.getRepository(StallEntity),
        dataSource.getRepository(StallAssignmentEntity),
        dataSource,
        audit,
        stableAccess,
      ),
      new DomainEventPublisher(),
      dataSource,
      audit,
      new TrainingOperationsFacade(),
      {} as GroomAssignmentsService,
      new HorsePlacementsRepository(dataSource),
    );
  });

  afterAll(() => stopTestPostgres(db));

  const barnOf = async (name: string, trainerId: string): Promise<string> => {
    const id = await seed.barn(name);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, id],
    );
    await dataSource.query(
      `INSERT INTO stalls (id, version, barn_id, code) VALUES ($1, 1, $2, $3)`,
      [randomUUID(), id, `${name}-01`],
    );
    return id;
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    actor = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
    trainerA = await seed.user(UserRole.HEAD_TRAINER);
    trainerB = await seed.user(UserRole.HEAD_TRAINER);
    barnA = await barnOf('Khu A', trainerA);
    barnSameTrainer = await barnOf('Khu C', trainerA);
    barnOtherTrainer = await barnOf('Khu B', trainerB);
    horseId = await seed.horse('Winx', { barnId: barnA });
    ({ classId } = await seed.trainingClass(trainerA, {
      startDate: '2026-01-01',
      endDate: '2030-12-31',
    }));
    enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, enrolled_at, status)
       VALUES ($1, 1, $2, $3, '2026-01-01T00:00:00Z', 'ACTIVE')`,
      [enrollmentId, classId, horseId],
    );
    sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z', 'SCHEDULED', 'MODERATE', 3000)`,
      [sessionId, classId],
    );
  });

  const participant = (status: string) =>
    dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES (gen_random_uuid(), 1, $1, $2, $3, $4)`,
      [sessionId, horseId, enrollmentId, status],
    );

  const state = async () => {
    const [horse] = await dataSource.query<Array<{ barn_id: string }>>(
      'SELECT barn_id FROM horses WHERE id = $1',
      [horseId],
    );
    const [enrollment] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM horse_enrollments WHERE id = $1',
      [enrollmentId],
    );
    return { barnId: horse.barn_id, enrollment: enrollment.status };
  };

  const change = (barnId: string) =>
    service.assignBarn(actor, horseId, { barnId, reason: 'Cân bằng khu' });

  it('409 and changes nothing when the horse is training in a class that would be withdrawn', async () => {
    await participant('ONGOING');

    await expect(change(barnOtherTrainer)).rejects.toThrow(
      'Ngựa đang tập, chờ hoàn thành lượt tập rồi mới đổi khu',
    );

    expect(await state()).toEqual({ barnId: barnA, enrollment: 'ACTIVE' });
  });

  it('allows the change when the new barn has the same head trainer, the class is kept', async () => {
    await participant('ONGOING');

    await change(barnSameTrainer);

    expect(await state()).toEqual({
      barnId: barnSameTrainer,
      enrollment: 'ACTIVE',
    });
  });

  it('changes barn and withdraws the class when no participant is ONGOING', async () => {
    await participant('PLANNED');

    await change(barnOtherTrainer);

    expect(await state()).toEqual({
      barnId: barnOtherTrainer,
      enrollment: 'LEFT',
    });
  });
});
