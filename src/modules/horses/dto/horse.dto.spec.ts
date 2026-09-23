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
