import { Injectable, UnauthorizedException } from '@nestjs/common';
import { KeycloakOidcRedirectService } from '../../../common/infrastructure/keycloak/keycloak-oidc-redirect.service';
import { KeycloakConfig } from '../../../common/infrastructure/keycloak/keycloak.config';
import { KeycloakService } from '../../../common/infrastructure/keycloak/keycloak.service';
import { KeycloakTokenService } from '../../../common/infrastructure/keycloak/token.service';
import type { KeycloakIdentityProvider } from '../../../common/infrastructure/keycloak/types/oidc';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import { ProvisioningService } from '../../users/services/provisioning.service';
import { AuthTokensResponseDto } from '../dto/auth-tokens.response.dto';
import { CurrentUserResponseDto } from '../dto/current-user.response.dto';
import {
  toAuthTokensResponse,
  toCurrentUserResponse,
} from '../mappers/auth.mapper';
@Injectable()
export class AuthService {
  constructor(
    private readonly keycloakTokens: KeycloakTokenService,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly oidcRedirect: KeycloakOidcRedirectService,
    private readonly keycloakConfig: KeycloakConfig,
    private readonly keycloak: KeycloakService,
    private readonly provisioning: ProvisioningService,
  ) {}

  /**
   * Đăng nhập bằng email và mật khẩu qua Keycloak
   *
   * @param email Email của tài khoản
   * @param password Mật khẩu của tài khoản
   * @returns Promise trả về access token và refresh token
   * @throws UnauthorizedException Nếu sai email hoặc mật khẩu, chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   * @throws BadGatewayException Nếu Keycloak trả lỗi
   */
  async login(email: string, password: string): Promise<AuthTokensResponseDto> {
    return this.issueSession(
      toAuthTokensResponse(
        await this.keycloakTokens.exchangePasswordForToken({
          username: email,
          password,
        }),
      ),
    );
  }

  /**
   * Đổi refresh token lấy bộ token mới
   *
   * @param refreshToken Refresh token đang giữ
   * @returns Promise trả về access token và refresh token mới
   * @throws BadGatewayException Nếu Keycloak từ chối refresh token hoặc trả lỗi
   */
  async refresh(refreshToken: string): Promise<AuthTokensResponseDto> {
    return toAuthTokensResponse(
      await this.keycloakTokens.exchangeRefreshTokenForToken({ refreshToken }),
    );
  }

  /**
   * Thu hồi refresh token trên Keycloak
   *
   * @param refreshToken Refresh token cần thu hồi
   * @returns Promise hoàn tất khi Keycloak đã thu hồi token
   * @throws BadGatewayException Nếu Keycloak trả lỗi
   */
  logout(refreshToken: string): Promise<void> {
    return this.keycloakTokens.revokeRefreshToken({ refreshToken });
  }

  /**
   * Lấy thông tin tài khoản và vai trò của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về thông tin tài khoản hiện tại
   * @throws UnauthorizedException Nếu chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   */
  async me(actor: Actor): Promise<CurrentUserResponseDto> {
    const user = await this.provisioning.requireProvisionedUser(actor);
    return toCurrentUserResponse(user, actor);
  }

  /**
   * Đổi mật khẩu của người gọi rồi đăng xuất mọi phiên Keycloak của họ
   *
   * - Kiểm mật khẩu hiện tại bằng cách đăng nhập thử với Keycloak
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param currentPassword Mật khẩu hiện tại
   * @param newPassword Mật khẩu mới
   * @returns Promise hoàn tất khi đã đổi mật khẩu và đăng xuất các phiên
   * @throws UnauthorizedException Nếu token không có email hoặc mật khẩu hiện tại không đúng
   * @throws BadGatewayException Nếu Keycloak trả lỗi
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

  /**
   * Tạo URL chuyển hướng sang identity provider để bắt đầu đăng nhập OIDC
   *
   * @param provider Identity provider người dùng chọn
   * @returns Promise trả về URL authorize của Keycloak
   */
  buildOidcLoginUrl(provider: KeycloakIdentityProvider): Promise<string> {
    return this.oidcRedirect.buildAuthorizeRedirectUrl(
      provider,
      this.keycloakConfig.redirectUri,
    );
  }

  /**
   * Hoàn tất đăng nhập OIDC: đổi authorization code lấy token
   *
   * @param provider Identity provider của luồng đăng nhập
   * @param code Authorization code identity provider trả về
   * @param state State đã gửi đi lúc bắt đầu đăng nhập
   * @returns Promise trả về access token và refresh token
   * @throws UnauthorizedException Nếu state không hợp lệ hoặc đã hết hạn, chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   * @throws BadGatewayException Nếu Keycloak trả lỗi
   */
  async completeOidcLogin(
    provider: KeycloakIdentityProvider,
    code: string,
    state: string,
  ): Promise<AuthTokensResponseDto> {
    const { codeVerifier, redirectUri } =
      await this.oidcRedirect.consumePkceBundle(provider, state);
    return this.issueSession(
      toAuthTokensResponse(
        await this.keycloakTokens.exchangeCodeForToken({
          code,
          redirectUri,
          codeVerifier,
        }),
      ),
    );
  }

  /**
   * Xác thực access token vừa cấp và bắt buộc tài khoản đã có row `users` đang hoạt động trước khi trả token
   *
   * @param tokens Bộ token vừa nhận từ Keycloak
   * @returns Promise trả về chính bộ token đã nhận
   * @throws UnauthorizedException Nếu token không hợp lệ, chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   */
  private async issueSession(
    tokens: AuthTokensResponseDto,
  ): Promise<AuthTokensResponseDto> {
    const claims = await this.keycloak.verifyToken(tokens.accessToken);
    await this.provisioning.requireProvisionedUser(claims);
    return tokens;
  }
}
