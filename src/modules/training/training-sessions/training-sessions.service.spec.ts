import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { UpdateTrainingSessionDto } from '../dto/training-session.dto';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
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
    intensity: TrainingIntensity.MODERATE,
    plannedDistanceM: 3000,
    scheduledStartAt: new Date('2026-10-10T01:00:00.000Z'),
    scheduledEndAt: new Date('2026-10-10T02:00:00.000Z'),
    location: 'Sân A',
    surface: 'Cỏ',
    notes: 'Ghi chú cũ',
    status: TrainingSessionStatus.DRAFT,
  };
  const manager = {
    save: jest.fn((row: unknown) => Promise.resolve(row)),
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
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    }),
    assertCanManageClass: jest.fn(),
  };
  const service = new TrainingSessionsService(
    {} as Repository<TrainingSessionEntity>,
    access as unknown as TrainingAccessService,
    dataSource,
  );
  return { service, session };
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
});

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
