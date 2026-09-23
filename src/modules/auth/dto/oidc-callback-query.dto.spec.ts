import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { OidcCallbackQueryDto } from './oidc-callback-query.dto';

describe('OidcCallbackQueryDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const parse = (query: Record<string, unknown>) =>
    pipe.transform(query, { type: 'query', metatype: OidcCallbackQueryDto });

  it('accepts the redirect Keycloak sends back, including session_state and iss', async () => {
    await expect(
      parse({
        code: 'abc',
        state: 'xyz',
        session_state: 'sess',
        iss: 'http://keycloak/realms/club',
      }),
    ).resolves.toMatchObject({ code: 'abc', state: 'xyz' });
  });

  it.each([
    [{ state: 'xyz' }],
    [{ code: '', state: 'xyz' }],
    [{ code: 'abc' }],
    [{ code: 'abc', state: '' }],
  ])('rejects a missing or empty code/state: %j', async (query) => {
    await expect(parse(query)).rejects.toThrow(BadRequestException);
  });
});
