import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Actor } from '../../../common/auth/actor';
import { KeycloakTokenService } from '../../../common/integration/keycloak/token.service';
import { KeycloakUserService } from '../../../common/integration/keycloak/user.service';
import { KeycloakOidcRedirectService } from '../../../common/integration/keycloak/keycloak-oidc-redirect.service';
import { KeycloakConfig } from '../../../common/integration/keycloak/keycloak.config';
import type { KeycloakIdentityProvider } from '../../../common/integration/keycloak/types/oidc';
import type { KeycloakTokenResponse } from '../../../common/integration/keycloak/types/token';
import { UsersRepository } from '../../users/repositories/users.repository';
import { toUserResponse } from '../../users/mappers/user.mapper';
import { UserResponseDto } from '../../users/dto/user.response.dto';
import { UserStatus } from '../../users/user.enums';
import { splitFullName } from '../../users/utils/split-full-name';
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
    private readonly users: UsersRepository,
  ) {}

  /**
   * Tu dang ky: tao danh tinh Keycloak KHONG gan realm role nao, va row local
   * o trang thai PENDING. Nguoi nay dang nhap duoc, nhung `actor.roles` rong
   * nen moi @Access() deu truot, va currentUser() chan vi status != ACTIVE.
   * Ho chi cham duoc route @Registration() cho toi khi CLUB_MANAGER duyet.
   */
  async register(dto: RegisterDto): Promise<UserResponseDto> {
    // Keycloak truoc: hong o day thi chua co gi de don dep.
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
      // Hanh dong bu: khong xoa thi con lai danh tinh Keycloak mo coi, va lan
      // dang ky sau cung email se dinh 409 vinh vien.
      await this.keycloakUsers.deleteUser(keycloakId);
      throw error;
    }
  }

  async login(email: string, password: string): Promise<AuthTokensResponseDto> {
    return this.toTokenResponse(
      await this.keycloakTokens.exchangePasswordForToken({
        username: email,
        password,
      }),
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
    const user = await this.users.findByKeycloakId(actor.sub);
    if (!user) {
      throw new ForbiddenException('Tai khoan chua dang ky trong he thong');
    }
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

  /**
   * Keycloak khong co REST endpoint "tu doi mat khau cua chinh minh" cho
   * confidential client (/account/credentials/password tra 404). Cach chuan
   * la: dang nhap that bang mat khau cu de CHUNG MINH nguoi goi biet no,
   * roi dung Admin API dat mat khau moi.
   *
   * Khong can cham database: email va keycloak id deu nam san trong actor.
   */
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
    return this.toTokenResponse(
      await this.keycloakTokens.exchangeCodeForToken({
        code,
        redirectUri,
        codeVerifier,
      }),
    );
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
