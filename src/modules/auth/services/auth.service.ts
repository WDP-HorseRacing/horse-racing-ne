import { Injectable, UnauthorizedException } from '@nestjs/common';
import { KeycloakOidcRedirectService } from '../../../common/infrastructure/keycloak/keycloak-oidc-redirect.service';
import { KeycloakConfig } from '../../../common/infrastructure/keycloak/keycloak.config';
import { KeycloakService } from '../../../common/infrastructure/keycloak/keycloak.service';
import { KeycloakTokenService } from '../../../common/infrastructure/keycloak/token.service';
import type { KeycloakIdentityProvider } from '../../../common/infrastructure/keycloak/types/oidc';
import type { KeycloakTokenResponse } from '../../../common/infrastructure/keycloak/types/token';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import { UserResponseDto } from '../../users/dto/user.response.dto';
import { toUserResponse } from '../../users/mappers/user.mapper';
import { UsersRepository } from '../../users/repositories/users.repository';
import { ProvisioningService } from '../../users/services/provisioning.service';
import { UserStatus } from '../../users/user.enums';
import { splitFullName } from '../../users/utils/name';
import { AuthTokensResponseDto } from '../dto/auth-tokens.response.dto';
import { CurrentUserResponseDto } from '../dto/current-user.response.dto';
import { RegisterDto } from '../dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly keycloakTokens: KeycloakTokenService,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly oidcRedirect: KeycloakOidcRedirectService,
    private readonly keycloakConfig: KeycloakConfig,
    private readonly keycloak: KeycloakService,
    private readonly users: UsersRepository,
    private readonly provisioning: ProvisioningService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const keycloakId = await this.keycloakUsers.registerUserWithPassword({
      username: dto.email,
      email: dto.email,
      password: dto.password,
      ...splitFullName(dto.fullName),
    });
    try {
      const user = await this.users.create({
        keycloakId,
        clubId: dto.clubId ?? null,
        fullName: dto.fullName,
        email: dto.email,
        role: null,
        status: UserStatus.PENDING,
      });
      return toUserResponse(user);
    } catch (error) {
      await this.keycloakUsers.deleteUser(keycloakId);
      throw error;
    }
  }

  async login(email: string, password: string): Promise<AuthTokensResponseDto> {
    return this.issueSession(
      this.toTokenResponse(
        await this.keycloakTokens.exchangePasswordForToken({
          username: email,
          password,
        }),
      ),
    );
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponseDto> {
    return this.toTokenResponse(
      await this.keycloakTokens.exchangeRefreshTokenForToken({ refreshToken }),
    );
  }

  logout(refreshToken: string): Promise<void> {
    return this.keycloakTokens.revokeRefreshToken({ refreshToken });
  }

  async me(actor: Actor): Promise<CurrentUserResponseDto> {
    const user =
      (await this.users.findByKeycloakId(actor.sub)) ??
      (await this.provisioning.ensureUser(actor));
    return {
      userId: user.id,
      clubId: user.clubId,
      role: user.role,
      status: user.status,
      email: user.email,
      fullName: user.fullName,
      roles: actor.roles,
    };
  }

  async changePassword(
    actor: Actor,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!actor.email) {
      throw new UnauthorizedException('Token khong chua email');
    }
    try {
      await this.keycloakTokens.exchangePasswordForToken({
        username: actor.email,
        password: currentPassword,
      });
    } catch {
      throw new UnauthorizedException('Mat khau hien tai khong dung');
    }
    await this.keycloakUsers.resetUserPassword(actor.sub, newPassword);
    await this.keycloakUsers.logoutUser(actor.sub);
  }

  buildOidcLoginUrl(provider: KeycloakIdentityProvider): Promise<string> {
    return this.oidcRedirect.buildAuthorizeRedirectUrl(
      provider,
      this.keycloakConfig.redirectUri,
    );
  }

  async completeOidcLogin(
    provider: KeycloakIdentityProvider,
    code: string,
    state: string,
  ): Promise<AuthTokensResponseDto> {
    const { codeVerifier, redirectUri } =
      await this.oidcRedirect.consumePkceBundle(provider, state);
    return this.issueSession(
      this.toTokenResponse(
        await this.keycloakTokens.exchangeCodeForToken({
          code,
          redirectUri,
          codeVerifier,
        }),
      ),
    );
  }

  /**
   * Cua ngo chung cua MOI luong dang nhap: doc claim tu access token vua cap,
   * bao dam co row `users` roi moi tra token ve.
   */
  private async issueSession(
    tokens: AuthTokensResponseDto,
  ): Promise<AuthTokensResponseDto> {
    const claims = await this.keycloak.verifyToken(tokens.accessToken);
    await this.provisioning.ensureUser(claims);
    return tokens;
  }

  private toTokenResponse(
    tokens: KeycloakTokenResponse,
  ): AuthTokensResponseDto {
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
    };
  }
}
