import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HorseGender } from '../enums/horse-gender.enum';
import { RaceAptitude } from '../enums/race-aptitude.enum';
import { CreateHorseDto, UpdateHorseDto } from './horse-profile.dto';

/**
 * Chạy transform + validate giống ValidationPipe toàn cục (transform: true) rồi trả danh sách field lỗi.
 */
async function invalidFields<T extends object>(
  dto: new () => T,
  plain: Record<string, unknown>,
): Promise<{ instance: T; fields: string[] }> {
  const instance = plainToInstance(dto, plain);
  const errors = await validate(instance);
  return { instance, fields: errors.map((error) => error.property) };
}

describe('horse DTOs', () => {
  describe('CreateHorseDto.name', () => {
    it('rejects a name made only of spaces', async () => {
      const { fields } = await invalidFields(CreateHorseDto, {
        name: '   ',
        gender: HorseGender.MALE,
      });
      expect(fields).toContain('name');
    });

    it('trims the name before validating', async () => {
      const { instance, fields } = await invalidFields(CreateHorseDto, {
        name: '  Gió  ',
        gender: HorseGender.MALE,
      });
      expect(fields).not.toContain('name');
      expect(instance.name).toBe('Gió');
    });
  });

  describe.each([
    [
      'CreateHorseDto',
      CreateHorseDto,
      { name: 'Gió', gender: HorseGender.MALE },
    ],
    ['UpdateHorseDto', UpdateHorseDto, { version: 1 }],
  ] as const)('%s microchipId, breed, color', (_label, dto, base) => {
    const check = (extra: Record<string, unknown>) =>
      invalidFields(dto as new () => object, { ...base, ...extra });

    it.each(['123456789012345', '  123456789012345  '])(
      'accepts microchipId %p',
      async (microchipId) => {
        const { fields } = await check({ microchipId });
        expect(fields).not.toContain('microchipId');
      },
    );

    it.each([
      '12345678901234',
      '1234567890123456',
      'CHIP-1',
      '12345678901234a',
    ])('rejects microchipId %p', async (microchipId) => {
      const { fields } = await check({ microchipId });
      expect(fields).toContain('microchipId');
    });

    it.each([
      'Thoroughbred',
      'Anglo-Arabian',
      'Akhal-Teke',
      'Quarter Horse',
      'Dark Bay',
      'Ngựa nội',
      ' Bay ',
    ])('accepts breed and color %p', async (text) => {
      const { fields } = await check({ breed: text, color: text });
      expect(fields).not.toContain('breed');
      expect(fields).not.toContain('color');
    });

    it.each(['Bay2', 'Bay--', ' -Bay', 'Nâu  sẫm', 'Bay!', '123'])(
      'rejects breed and color %p',
      async (text) => {
        const { fields } = await check({ breed: text, color: text });
        expect(fields).toEqual(expect.arrayContaining(['breed', 'color']));
      },
    );

    it('turns empty or null values into null without error', async () => {
      const { instance, fields } = await check({
        microchipId: '  ',
        breed: '',
        color: null,
      });
      expect(fields).toEqual([]);
      expect(instance).toMatchObject({
        microchipId: null,
        breed: null,
        color: null,
      });
    });

    it('gives the Vietnamese messages', async () => {
      const instance = plainToInstance(dto as new () => object, {
        ...base,
        microchipId: 'x',
        breed: '1',
        color: '1',
      });
      const messages = (await validate(instance)).flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );
      expect(messages).toEqual(
        expect.arrayContaining([
          'Số chip phải gồm đúng 15 chữ số',
          'Giống chỉ gồm chữ cái, khoảng trắng hoặc gạch nối',
          'Màu lông chỉ gồm chữ cái, khoảng trắng hoặc gạch nối',
        ]),
      );
    });
  });

  describe('UpdateHorseDto.name', () => {
    it('rejects a name made only of spaces', async () => {
      const { fields } = await invalidFields(UpdateHorseDto, {
        version: 1,
        name: '   ',
      });
      expect(fields).toContain('name');
    });

    it('trims the name before validating', async () => {
      const { instance, fields } = await invalidFields(UpdateHorseDto, {
        version: 1,
        name: '  Bão ',
      });
      expect(fields).not.toContain('name');
      expect(instance.name).toBe('Bão');
    });
  });

  describe('raceAptitude (BA 2026-09-23: CM không nhập lúc tạo)', () => {
    const strict = { whitelist: true, forbidNonWhitelisted: true };

    it('rejects raceAptitude when creating a horse', async () => {
      const instance = plainToInstance(CreateHorseDto, {
        name: 'Gió',
        gender: HorseGender.MALE,
        raceAptitude: RaceAptitude.SPRINTER,
      });
      const errors = await validate(instance, strict);
      expect(errors.map((error) => error.property)).toContain('raceAptitude');
    });

    it('still accepts raceAptitude when updating a horse', async () => {
      const instance = plainToInstance(UpdateHorseDto, {
        version: 1,
        raceAptitude: RaceAptitude.SPRINTER,
      });
      const errors = await validate(instance, strict);
      expect(errors.map((error) => error.property)).not.toContain(
        'raceAptitude',
      );
    });
  });
});
