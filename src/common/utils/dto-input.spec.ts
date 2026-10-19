import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsIsoInstant } from './dto-input';

class InstantDto {
  @IsIsoInstant()
  at!: string;
}

const accepts = (at: unknown) =>
  validateSync(plainToInstance(InstantDto, { at })).length === 0;

describe('IsIsoInstant', () => {
  it.each([
    '2026-10-23T00:30:00+07:00',
    '2026-10-22T17:30:00Z',
    '2026-10-22T17:30:00.123Z',
    '2026-10-22T17:30-05:00',
  ])('accepts %s', (at) => expect(accepts(at)).toBe(true));

  it.each([
    '2026-10-23T00:30:00',
    '2026-10-23',
    '2026-10-23 00:30:00+07:00',
    '2026-02-30T00:30:00Z',
    '2026-10-23T00:30:00+0700',
    20261023,
  ])('rejects %s', (at) => expect(accepts(at)).toBe(false));

  it('reports the Vietnamese message with the field name', () => {
    const [error] = validateSync(plainToInstance(InstantDto, { at: 'x' }));
    expect(error.constraints).toEqual({
      isIsoInstant:
        'at phải là thời điểm ISO 8601 có múi giờ, vd 2026-10-23T00:30:00+07:00',
    });
  });
});
