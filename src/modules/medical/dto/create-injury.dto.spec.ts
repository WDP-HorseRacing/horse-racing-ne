import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';
import { CreateInjuryDto } from './create-injury.dto';

const injury = {
  bodyRegion: InjuryBodyRegion.LEFT_FRONT_LEG,
  injuryType: InjuryType.SPRAIN,
  recoveryStatus: RecoveryStatus.ACUTE,
};

async function failedFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateInjuryDto, body));
  return errors.map((error) => error.property);
}

describe('CreateInjuryDto position', () => {
  it('accepts a point with x, y and z', async () => {
    await expect(
      failedFields({ ...injury, position: { x: 0.1, y: -0.6, z: 0 } }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['null', { position: null }],
    ['without z', { position: { x: 0.1, y: 0.6 } }],
    ['with a text coordinate', { position: { x: '0.1', y: 0.6, z: 0 } }],
  ])('rejects a position %s', async (_case, extra) => {
    await expect(failedFields({ ...injury, ...extra })).resolves.toEqual([
      'position',
    ]);
  });
});
