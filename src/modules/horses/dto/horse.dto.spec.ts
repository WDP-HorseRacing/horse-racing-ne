import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { HorseLifecycleStatus } from '../constants/horse-status.enum';
import {
  CreateHorseDto,
  DeleteHorseDto,
  UpdateHorseDto,
  UpdateHorseLifecycleDto,
} from './horse.dto';

describe('CreateHorseDto dateOfBirth', () => {
  const dateOfBirthErrors = (dateOfBirth: unknown) =>
    validateSync(plainToInstance(CreateHorseDto, { dateOfBirth })).filter(
      (error) => error.property === 'dateOfBirth',
    );

  it.each(['2026-09-19', '2024-02-29'])('accepts %s', (value) => {
    expect(dateOfBirthErrors(value)).toHaveLength(0);
  });

  it('accepts a missing date', () => {
    expect(dateOfBirthErrors(null)).toHaveLength(0);
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '20260920',
    '2026-W38',
    '2026-262',
    '2026-09',
    '2026-09-20T01:00:00+07:00',
    '2026-09-19T00:00:00Z',
  ])('rejects %s', (value) => {
    expect(dateOfBirthErrors(value).length).toBeGreaterThan(0);
  });
});

describe('UpdateHorseDto', () => {
  const errorsOf = (body: Record<string, unknown>, property: string) =>
    validateSync(plainToInstance(UpdateHorseDto, body)).filter(
      (error) => error.property === property,
    );

  it('requires the version', () => {
    expect(errorsOf({}, 'version').length).toBeGreaterThan(0);
  });

  it('accepts a body with only the version', () => {
    expect(
      validateSync(plainToInstance(UpdateHorseDto, { version: 1 })),
    ).toHaveLength(0);
  });

  it.each(['name', 'gender'])('rejects a null %s', (property) => {
    expect(
      errorsOf({ version: 1, [property]: null }, property).length,
    ).toBeGreaterThan(0);
  });

  it('accepts a null breed to clear it', () => {
    expect(errorsOf({ version: 1, breed: null }, 'breed')).toHaveLength(0);
  });
});

describe.each([
  ['UpdateHorseLifecycleDto', UpdateHorseLifecycleDto],
  ['DeleteHorseDto', DeleteHorseDto],
])('%s reason', (_name, dto) => {
  const reasonErrors = (reason: unknown) =>
    validateSync(
      plainToInstance(dto, {
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
        reason,
      }),
    ).filter((error) => error.property === 'reason');

  it('accepts a reason and trims it', () => {
    const body = plainToInstance(dto, { reason: '  Tạo nhầm  ' });
    expect(body.reason).toBe('Tạo nhầm');
    expect(reasonErrors('Tạo nhầm')).toHaveLength(0);
  });

  it.each([undefined, '', '   ', 'x'.repeat(501)])('rejects %p', (value) => {
    expect(reasonErrors(value).length).toBeGreaterThan(0);
  });
});
