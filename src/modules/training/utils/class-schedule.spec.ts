import type { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { buildClassSchedule } from './class-schedule';

const subject = (name: string) => ({ id: name, name }) as TrainingSubjectEntity;

describe('buildClassSchedule', () => {
  const endurance = subject('Sức bền');
  const sprint = subject('Nước rút');

  it('places each subject on its own weekdays and switches subjects with the phase', () => {
    const sessions = buildClassSchedule(
      [
        {
          weeks: 2,
          subjects: [
            { subject: endurance, weekdays: [1, 3] },
            { subject: sprint, weekdays: [5] },
          ],
        },
        { weeks: 1, subjects: [{ subject: sprint, weekdays: [2] }] },
      ],
      '2026-10-05',
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
      [1, 'Nước rút', '2026-10-08T23:00:00.000Z'],
      [2, 'Sức bền', '2026-10-11T23:00:00.000Z'],
      [2, 'Sức bền', '2026-10-13T23:00:00.000Z'],
      [2, 'Nước rút', '2026-10-15T23:00:00.000Z'],
      [3, 'Nước rút', '2026-10-19T23:00:00.000Z'],
    ]);
    expect(sessions[0].scheduledEndAt.toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
  });

  it('counts weeks from the start date, not from Monday', () => {
    const sessions = buildClassSchedule(
      [
        { weeks: 1, subjects: [{ subject: endurance, weekdays: [1, 3] }] },
        { weeks: 1, subjects: [{ subject: sprint, weekdays: [3] }] },
      ],
      '2026-10-07',
      '15:00',
      90,
    );

    expect(
      sessions.map((item) => [
        item.week,
        item.subject.name,
        item.scheduledStartAt.toISOString(),
        item.scheduledEndAt.toISOString(),
      ]),
    ).toEqual([
      [1, 'Sức bền', '2026-10-07T08:00:00.000Z', '2026-10-07T09:30:00.000Z'],
      [1, 'Sức bền', '2026-10-12T08:00:00.000Z', '2026-10-12T09:30:00.000Z'],
      [2, 'Nước rút', '2026-10-14T08:00:00.000Z', '2026-10-14T09:30:00.000Z'],
    ]);
  });

  it('skips the days that belong to no subject of the phase', () => {
    const sessions = buildClassSchedule(
      [{ weeks: 1, subjects: [{ subject: endurance, weekdays: [7] }] }],
      '2026-10-05',
      '06:00',
      60,
    );

    expect(sessions.map((item) => item.scheduledStartAt.toISOString())).toEqual(
      ['2026-10-10T23:00:00.000Z'],
    );
  });
});
