import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { AxiosError, type AxiosResponse } from 'axios';
import type { AxiosService } from '../axios/axios.service';
import type { KeycloakJwksService } from './jwks.service';
import type { KeycloakConfig } from './keycloak.config';
import { KeycloakHttpService } from './keycloak-http.service';
import { KeycloakTokenService } from './token.service';

function tokenServiceAnswering(status: number): KeycloakTokenService {
  const config = {
    tokenEndpoint: '/token',
    authServerUrl: 'http://keycloak',
    clientCredentials: () => ({}),
  } as unknown as KeycloakConfig;
  const axios = {
    create: () => ({
      request: () =>
        Promise.reject(
          new AxiosError('fail', 'ERR_BAD_REQUEST', undefined, undefined, {
            status,
          } as AxiosResponse),
        ),
    }),
  } as unknown as AxiosService;
  return new KeycloakTokenService(
    config,
    new KeycloakHttpService(config, axios),
    {} as KeycloakJwksService,
  );
}

describe('KeycloakTokenService.exchangePasswordForToken', () => {
  const login = (status: number) =>
    tokenServiceAnswering(status).exchangePasswordForToken({
      username: 'a@b.c',
      password: 'x',
    });

  it('turns a Keycloak 401 into a wrong credentials 401', async () => {
    await expect(login(401)).rejects.toEqual(
      new UnauthorizedException('Tài khoản hoặc mật khẩu không chính xác!'),
    );
  });

  it('reports other Keycloak errors as 502 in Vietnamese', async () => {
    await expect(login(500)).rejects.toEqual(
      new BadGatewayException('Máy chủ xác thực báo lỗi (mã 500)'),
    );
  });
});

describe('KeycloakTokenService.exchangeRefreshTokenForToken', () => {
  const refresh = (status: number) =>
    tokenServiceAnswering(status).exchangeRefreshTokenForToken({
      refreshToken: 'expired',
    });

  it('turns a rejected refresh token into a 401 asking to log in again', async () => {
    await expect(refresh(400)).rejects.toEqual(
      new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      ),
    );
  });

  it('keeps other Keycloak errors as 502', async () => {
    await expect(refresh(500)).rejects.toEqual(
      new BadGatewayException('Máy chủ xác thực báo lỗi (mã 500)'),
    );
  });
});
