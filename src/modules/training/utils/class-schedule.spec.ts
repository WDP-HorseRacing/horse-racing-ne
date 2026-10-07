import type { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { buildClassSchedule } from './class-schedule';

const subject = (name: string) => ({ id: name, name }) as TrainingSubjectEntity;

describe('buildClassSchedule', () => {
  const endurance = subject('Sức bền');
  const sprint = subject('Nước rút');

  it('repeats the chosen weekdays every week with the subject of that week', () => {
    const sessions = buildClassSchedule(
      [
        { subject: endurance, weeks: 2 },
        { subject: sprint, weeks: 1 },
      ],
      '2026-10-05',
      [1, 3, 5],
      '06:00',
      60,
    );

    expect(
      sessions.map((item) => [
        item.week,
        item.subject.name,
        item.scheduledStartAt.toISOString(),
      ]),
    ).toEqual([
      [1, 'Sức bền', '2026-10-04T23:00:00.000Z'],
      [1, 'Sức bền', '2026-10-06T23:00:00.000Z'],
      [1, 'Sức bền', '2026-10-08T23:00:00.000Z'],
      [2, 'Sức bền', '2026-10-11T23:00:00.000Z'],
      [2, 'Sức bền', '2026-10-13T23:00:00.000Z'],
      [2, 'Sức bền', '2026-10-15T23:00:00.000Z'],
      [3, 'Nước rút', '2026-10-18T23:00:00.000Z'],
      [3, 'Nước rút', '2026-10-20T23:00:00.000Z'],
      [3, 'Nước rút', '2026-10-22T23:00:00.000Z'],
    ]);
    expect(sessions[0].scheduledEndAt.toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
  });

  it('counts weeks from the start date, not from Monday', () => {
    const sessions = buildClassSchedule(
      [{ subject: endurance, weeks: 1 }],
      '2026-10-07',
      [1, 3],
      '15:00',
      90,
    );

    expect(sessions.map((item) => item.scheduledStartAt.toISOString())).toEqual(
      ['2026-10-07T08:00:00.000Z', '2026-10-12T08:00:00.000Z'],
    );
  });
});
