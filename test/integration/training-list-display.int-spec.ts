import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseEntity } from '../../src/modules/horses/entities/horse.entity';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../src/modules/training/entities/session-participant.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { SessionParticipantsService } from '../../src/modules/training/training-sessions/session-participants.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Training list endpoints return horse name, photo and groom name (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let participants: SessionParticipantsService;
  let enrollments: TrainingClassEnrollmentsService;
  let signed: string[][];
  let actor: Actor;
  let classId: string;
  let sessionId: string;
  let photoMediaId: string;
  let deletedHorsePhotoMediaId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    const media = {
      signDownloadUrls: (ids: string[]) => {
        signed.push(ids);
        return Promise.resolve(
          new Map(ids.map((id) => [id, `https://signed.test/${id}`])),
        );
      },
    } as unknown as MediaService;
    participants = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      access,
      new TrainingOperationsFacade(),
      dataSource,
      media,
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      new TrainingOperationsFacade(),
      dataSource,
      media,
    );
  });

  afterAll(() => stopTestPostgres(db));

  const mediaAsset = async (uploadedBy: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO media_assets (id, uploaded_by, object_key, mime_type, byte_size)
       VALUES ($1, $2, $3, 'image/jpeg', 1000)`,
      [id, uploadedBy, `horses/${id}.jpg`],
    );
    return id;
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    signed = [];
    const manager = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [manager],
    );
    actor = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const groom = await seed.user(UserRole.GROOM);
    const deletedGroom = await seed.user(UserRole.GROOM);
    await dataSource.query('UPDATE users SET full_name = $2 WHERE id = $1', [
      groom,
      'Groom Hoạt Động',
    ]);
    await dataSource.query(
      'UPDATE users SET full_name = $2, deleted_at = now() WHERE id = $1',
      [deletedGroom, 'Groom Đã Xóa'],
    );
    photoMediaId = await mediaAsset(manager);
    deletedHorsePhotoMediaId = await mediaAsset(manager);
    const withPhoto = await seed.horse('Gió');
    const withoutPhoto = await seed.horse('Bão');
    const deletedHorse = await seed.horse('Mây', { deleted: true });
    await dataSource.query(
      'UPDATE horses SET photo_asset_id = $2 WHERE id = $1',
      [withPhoto, photoMediaId],
    );
    await dataSource.query(
      'UPDATE horses SET photo_asset_id = $2 WHERE id = $1',
      [deletedHorse, deletedHorsePhotoMediaId],
    );
    ({ classId } = await seed.trainingClass(trainer, { code: 'A' }));
    sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi 1', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z', 'SCHEDULED', 'MODERATE', 3000)`,
      [sessionId, classId],
    );
    const seats: Array<[string, string | null, string]> = [
      [withPhoto, groom, '2026-09-05T00:00:00Z'],
      [withoutPhoto, null, '2026-09-06T00:00:00Z'],
      [deletedHorse, deletedGroom, '2026-09-07T00:00:00Z'],
    ];
    for (const [horseId, groomId, enrolledAt] of seats) {
      const enrollmentId = randomUUID();
      await dataSource.query(
        `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
         VALUES ($1, 1, $2, $3, 'ACTIVE', $4)`,
        [enrollmentId, classId, horseId, enrolledAt],
      );
      await dataSource.query(
        `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id, created_at)
         VALUES ($1, 1, $2, $3, $4, 'PLANNED', $5, $6)`,
        [randomUUID(), sessionId, horseId, enrollmentId, groomId, enrolledAt],
      );
    }
  });

  it('lists participants with horse name, photo url and groom name, deleted rows included', async () => {
    const horseFind = jest.spyOn(dataSource.manager, 'find');

    const result = await participants.list(actor, sessionId);

    expect(
      result.map((item) => [
        item.horseName,
        item.horsePhotoUrl,
        item.assignedGroomName,
      ]),
    ).toEqual([
      ['Gió', `https://signed.test/${photoMediaId}`, 'Groom Hoạt Động'],
      ['Bão', null, null],
      [
        'Mây',
        `https://signed.test/${deletedHorsePhotoMediaId}`,
        'Groom Đã Xóa',
      ],
    ]);
    expect(signed).toHaveLength(1);
    expect(
      horseFind.mock.calls.filter(([entity]) => entity === HorseEntity),
    ).toHaveLength(1);
    horseFind.mockRestore();
  });

  it('lists enrollments with horse name and photo url, deleted horse included', async () => {
    const horseFind = jest.spyOn(dataSource.manager, 'find');

    const result = await enrollments.list(actor, classId);

    expect(result.map((item) => [item.horseName, item.horsePhotoUrl])).toEqual([
      ['Gió', `https://signed.test/${photoMediaId}`],
      ['Bão', null],
      ['Mây', `https://signed.test/${deletedHorsePhotoMediaId}`],
    ]);
    expect(signed).toHaveLength(1);
    expect(
      horseFind.mock.calls.filter(([entity]) => entity === HorseEntity),
    ).toHaveLength(1);
    horseFind.mockRestore();
  });
});
