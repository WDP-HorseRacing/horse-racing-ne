import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AxiosModule } from '../axios/axios.module';
import { RedisModule } from '../redis/redis.module';
import { KeycloakConfig } from './keycloak.config';
import { KeycloakHttpService } from './keycloak-http.service';
import { KeycloakService } from './keycloak.service';
import { KeycloakJwksService } from './jwks.service';
import { KeycloakTokenService } from './token.service';
import { KeycloakUserService } from './user.service';
import { KeycloakOidcRedirectService } from './keycloak-oidc-redirect.service';

@Module({
  imports: [ConfigModule, RedisModule, AxiosModule],
  providers: [
    KeycloakConfig,
    KeycloakHttpService,
    KeycloakService,
    KeycloakJwksService,
    KeycloakTokenService,
    KeycloakUserService,
    KeycloakOidcRedirectService,
  ],
  exports: [
    KeycloakConfig,
    KeycloakService,
    KeycloakJwksService,
    KeycloakTokenService,
    KeycloakUserService,
    KeycloakOidcRedirectService,
  ],
})
export class KeycloakModule {}
