import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LogoutDto } from './logout.dto';

async function failedFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(LogoutDto, body));
  return errors.map((error) => error.property);
}

describe('LogoutDto', () => {
  it('accepts a body without deviceToken', async () => {
    await expect(failedFields({ refreshToken: 'r' })).resolves.toEqual([]);
  });

  it('accepts a device token of 1 to 4096 characters', async () => {
    await expect(
      failedFields({ refreshToken: 'r', deviceToken: 'x'.repeat(4096) }),
    ).resolves.toEqual([]);
  });

  it('rejects an empty, too long or non-string device token', async () => {
    for (const deviceToken of ['', 'x'.repeat(4097), 12]) {
      await expect(
        failedFields({ refreshToken: 'r', deviceToken }),
      ).resolves.toEqual(['deviceToken']);
    }
  });
});
