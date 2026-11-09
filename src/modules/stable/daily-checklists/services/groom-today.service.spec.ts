import type { DataSource } from 'typeorm';
import type { Actor } from '../../../../common/types/actor';
import { UserRole } from '../../../../common/enums/role.enum';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../../medical/constant/care-schedule.enum';
import { CareScheduleEntity } from '../../../medical/entity/care-schedule.entity';
import { DailyChecklistStatus } from '../../constants/daily-checklist-status.enum';
import { DailyChecklistEntity } from '../../entities/daily-checklist.entity';
import { FeedingPlanEntity } from '../../entities/feeding-plan.entity';
import { GroomAssignmentEntity } from '../../entities/groom-assignment.entity';
import { StallAssignmentEntity } from '../../entities/stall-assignment.entity';
import { SessionParticipantStatus } from '../../../training/enums/session-participant-status.enum';
import { GroomTodayService } from './groom-today.service';

jest.mock('../../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'groom-1',
    role: 'GROOM',
    fullName: 'Groom Một',
  }),
}));

describe('GroomTodayService', () => {
  const actor = (): Actor => ({ sub: 'kc-groom', roles: [UserRole.GROOM] });
  const date = '2026-11-08';

  let rows: Map<unknown, unknown[]>;
  let manager: {
    find: jest.Mock;
    getRepository: jest.Mock;
  };
  let media: { signDownloadUrls: jest.Mock };
  let runsBuilder: Record<string, jest.Mock>;
  let service: GroomTodayService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T03:00:00.000Z'));

    rows = new Map<unknown, unknown[]>([
      [GroomAssignmentEntity, []],
      [StallAssignmentEntity, []],
      [DailyChecklistEntity, []],
      [FeedingPlanEntity, []],
      [CareScheduleEntity, []],
    ]);
    runsBuilder = {};
    for (const method of [
      'innerJoinAndSelect',
      'withDeleted',
      'where',
      'andWhere',
      'orderBy',
    ]) {
      runsBuilder[method] = jest.fn(() => runsBuilder);
    }
    runsBuilder.getMany = jest.fn().mockResolvedValue([]);

    manager = {
      find: jest.fn((entity: unknown) =>
        Promise.resolve(rows.get(entity) ?? []),
      ),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => runsBuilder),
      })),
    };
    media = {
      signDownloadUrls: jest
        .fn()
        .mockResolvedValue(new Map([['evidence-1', 'https://s3/get']])),
    };
    service = new GroomTodayService(
      { manager } as unknown as DataSource,
      media as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns an empty horse list and keeps assigned runs as assisted runs', async () => {
    runsBuilder.getMany.mockResolvedValue([
      {
        id: 'participant-1',
        sessionId: 'session-1',
        horseId: 'horse-outside',
        status: SessionParticipantStatus.PLANNED,
        stoppedReason: null,
        horse: { id: 'horse-outside', name: 'Ngoài khu' },
        session: {
          id: 'session-1',
          name: 'Buổi sáng',
          scheduledStartAt: new Date('2026-11-08T01:00:00.000Z'),
          scheduledEndAt: new Date('2026-11-08T02:00:00.000Z'),
          location: 'Sân A',
          surface: 'Cát',
        },
      },
    ]);

    const result = await service.today(actor());

    expect(result.date).toBe(date);
    expect(result.horses).toEqual([]);
    expect(result.assistedRuns).toEqual([
      expect.objectContaining({
        participantId: 'participant-1',
        horseId: 'horse-outside',
        horseName: 'Ngoài khu',
        sessionName: 'Buổi sáng',
      }),
    ]);
    expect(manager.find).toHaveBeenCalledTimes(1);
  });

  it('sorts assigned horses and combines their stall, checklist, training and vet data', async () => {
    rows.set(GroomAssignmentEntity, [
      {
        horseId: 'horse-zulu',
        horse: {
          id: 'horse-zulu',
          name: 'Zulu',
          barn: { id: 'barn-1', name: 'Khu Một' },
        },
      },
      {
        horseId: 'horse-alpha',
        horse: { id: 'horse-alpha', name: 'Alpha', barn: null },
      },
    ]);
    rows.set(StallAssignmentEntity, [
      { horseId: 'horse-alpha', stall: { code: 'A-01' } },
    ]);
    rows.set(DailyChecklistEntity, [
      {
        id: 'checklist-1',
        horseId: 'horse-alpha',
        groomId: 'groom-1',
        checklistDate: date,
        status: DailyChecklistStatus.PENDING,
        horse: { id: 'horse-alpha', name: 'Alpha' },
        groom: { id: 'groom-1', fullName: 'Groom Một' },
        items: [
          {
            id: 'check-item-1',
            taskTypeId: 'task-1',
            position: 0,
            doneAt: new Date('2026-11-08T02:00:00.000Z'),
            doneBy: 'groom-1',
            note: null,
            evidenceMediaId: 'evidence-1',
            taskType: { name: 'Cho ăn' },
            doer: { id: 'groom-1', fullName: 'Groom Một' },
          },
        ],
        completedAt: null,
      },
    ]);
    rows.set(CareScheduleEntity, [
      {
        id: 'appointment-1',
        horseId: 'horse-alpha',
        horse: { id: 'horse-alpha', name: 'Alpha' },
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.SCHEDULED,
        dueAt: new Date('2026-11-08T02:30:00.000Z'),
      },
    ]);
    runsBuilder.getMany.mockResolvedValue([
      {
        id: 'participant-own',
        sessionId: 'session-own',
        horseId: 'horse-alpha',
        status: SessionParticipantStatus.PLANNED,
        stoppedReason: null,
        horse: { id: 'horse-alpha', name: 'Alpha' },
        session: {
          id: 'session-own',
          name: 'Buổi Alpha',
          scheduledStartAt: new Date('2026-11-08T01:00:00.000Z'),
          scheduledEndAt: new Date('2026-11-08T02:00:00.000Z'),
          location: null,
          surface: null,
        },
      },
      {
        id: 'participant-assisted',
        sessionId: 'session-assisted',
        horseId: 'horse-outside',
        status: SessionParticipantStatus.READY,
        stoppedReason: null,
        horse: { id: 'horse-outside', name: 'Ngoài khu' },
        session: {
          id: 'session-assisted',
          name: 'Buổi hỗ trợ',
          scheduledStartAt: new Date('2026-11-08T03:00:00.000Z'),
          scheduledEndAt: new Date('2026-11-08T04:00:00.000Z'),
          location: 'Sân B',
          surface: 'Cỏ',
        },
      },
    ]);

    const result = await service.today(actor());

    expect(result.horses.map((horse) => horse.horseName)).toEqual([
      'Alpha',
      'Zulu',
    ]);
    expect(result.horses[0]).toEqual(
      expect.objectContaining({
        horseId: 'horse-alpha',
        barnName: null,
        stallCode: 'A-01',
        checklist: expect.objectContaining({
          id: 'checklist-1',
          items: [
            expect.objectContaining({ evidenceImageUrl: 'https://s3/get' }),
          ],
        }) as unknown,
        feedingPlan: null,
        trainingRuns: [expect.objectContaining({ sessionName: 'Buổi Alpha' })],
      }),
    );
    expect(result.horses[1]).toEqual(
      expect.objectContaining({
        horseId: 'horse-zulu',
        barnName: 'Khu Một',
        stallCode: null,
        checklist: null,
        feedingPlan: null,
        trainingRuns: [],
      }),
    );
    expect(result.assistedRuns).toEqual([
      expect.objectContaining({
        participantId: 'participant-assisted',
        horseId: 'horse-outside',
      }),
    ]);
    expect(result.horseVetAppointments).toEqual([
      expect.objectContaining({
        id: 'appointment-1',
        horseId: 'horse-alpha',
        type: CareScheduleType.ROUTINE_CHECKUP,
      }),
    ]);
    expect(media.signDownloadUrls).toHaveBeenCalledWith(['evidence-1']);
    expect(runsBuilder.andWhere).toHaveBeenCalledWith(
      'session.status NOT IN (:...hidden)',
      { hidden: ['CANCELLED'] },
    );
    expect(runsBuilder.andWhere).toHaveBeenCalledWith(
      'participant.status IN (:...visible)',
      {
        visible: [
          'PLANNED',
          'PRESENT',
          'READY',
          'ONGOING',
          'COMPLETED',
          'STOPPED',
        ],
      },
    );
  });
});
