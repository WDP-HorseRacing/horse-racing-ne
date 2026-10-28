import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { decode } from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { KeycloakOidcRedirectService } from '../../../common/infrastructure/keycloak/keycloak-oidc-redirect.service';
import { KeycloakConfig } from '../../../common/infrastructure/keycloak/keycloak.config';
import { KeycloakService } from '../../../common/infrastructure/keycloak/keycloak.service';
import { KeycloakTokenService } from '../../../common/infrastructure/keycloak/token.service';
import type { KeycloakIdentityProvider } from '../../../common/infrastructure/keycloak/types/oidc';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { UserDevicesService } from '../../notifications/user-devices/user-devices.service';
import { UserEntity } from '../../users/entities/user.entity';
import { ProvisioningService } from '../../users/services/provisioning.service';
import { AuthTokensResponseDto } from '../dto/auth-tokens.response.dto';
import { CurrentUserResponseDto } from '../dto/current-user.response.dto';
import {
  toAuthTokensResponse,
  toCurrentUserResponse,
} from '../mappers/auth.mapper';
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly keycloakTokens: KeycloakTokenService,
    private readonly keycloakUsers: KeycloakUserService,
    private readonly oidcRedirect: KeycloakOidcRedirectService,
    private readonly keycloakConfig: KeycloakConfig,
    private readonly keycloak: KeycloakService,
    private readonly provisioning: ProvisioningService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly userDevices: UserDevicesService,
  ) {}

  /**
   * Đăng nhập bằng email và mật khẩu qua Keycloak
   *
   * - Thành công: ghi nhật ký LOGIN
   * - Sai mật khẩu và email thuộc một tài khoản local: ghi nhật ký LOGIN_FAILED rồi ném lỗi
   *
   * @param email Email của tài khoản
   * @param password Mật khẩu của tài khoản
   * @returns Promise trả về access token và refresh token
   * @throws UnauthorizedException Nếu sai email hoặc mật khẩu, chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   * @throws BadGatewayException Nếu Keycloak trả lỗi
   */
  async login(email: string, password: string): Promise<AuthTokensResponseDto> {
    let tokens: AuthTokensResponseDto;
    try {
      tokens = toAuthTokensResponse(
        await this.keycloakTokens.exchangePasswordForToken({
          username: email,
          password,
        }),
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.recordFailedLogin(email);
      }
      throw error;
    }
    return this.issueSession(tokens, { method: 'PASSWORD' });
  }

  /**
   * Đổi refresh token lấy bộ token mới
   *
   * @param refreshToken Refresh token đang giữ
   * @returns Promise trả về access token và refresh token mới
   * @throws UnauthorizedException Nếu Keycloak từ chối refresh token (hết hạn hoặc đã thu hồi)
   * @throws BadGatewayException Nếu Keycloak trả lỗi khác
   */
  async refresh(refreshToken: string): Promise<AuthTokensResponseDto> {
    return toAuthTokensResponse(
      await this.keycloakTokens.exchangeRefreshTokenForToken({ refreshToken }),
    );
  }

  /**
   * Thu hồi refresh token trên Keycloak, ghi nhật ký LOGOUT rồi gỡ thiết bị push nếu có gửi
   *
   * - Chỉ ghi nhật ký và gỡ thiết bị khi claim sub của refresh token thuộc một tài khoản local
   * - Có deviceToken: gỡ thiết bị đó khỏi tài khoản đăng xuất; token không có hoặc thuộc người khác thì bỏ qua
   * - Gỡ thiết bị lỗi: chỉ ghi log warning, đăng xuất vẫn thành công
   *
   * @param refreshToken Refresh token cần thu hồi
   * @param deviceToken FCM registration token của thiết bị cần gỡ, bỏ trống thì không gỡ thiết bị nào
   * @returns Promise hoàn tất khi Keycloak đã thu hồi token, đã ghi nhật ký và đã thử gỡ thiết bị
   * @throws BadGatewayException Nếu Keycloak trả lỗi
   */
  async logout(refreshToken: string, deviceToken?: string): Promise<void> {
    await this.keycloakTokens.revokeRefreshToken({ refreshToken });
    const claims = decode(refreshToken, { json: true });
    if (!claims?.sub) return;
    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { keycloakId: claims.sub },
    });
    if (!user) return;
    await this.recordAuth(user.id, user.id, AuditAction.LOGOUT, null);
    if (deviceToken) await this.removeDevice(user.id, deviceToken);
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
   * - Đổi xong: ghi nhật ký PASSWORD_CHANGE nếu người gọi có tài khoản local
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param currentPassword Mật khẩu hiện tại
   * @param newPassword Mật khẩu mới
   * @returns Promise hoàn tất khi đã đổi mật khẩu và đăng xuất các phiên
   * @throws UnauthorizedException Nếu token không có email
   * @throws BadRequestException Nếu mật khẩu hiện tại không đúng (lỗi gắn với ô `currentPassword`)
   * @throws BadGatewayException Nếu Keycloak trả lỗi
   */
  async changePassword(
    actor: Actor,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!actor.email) {
      throw new UnauthorizedException('Token không chứa email');
    }
    try {
      await this.keycloakTokens.exchangePasswordForToken({
        username: actor.email,
        password: currentPassword,
      });
    } catch {
      throw fieldBadRequest('currentPassword', 'Mật khẩu hiện tại không đúng');
    }
    await this.keycloakUsers.resetUserPassword(actor.sub, newPassword);
    await this.keycloakUsers.logoutUser(actor.sub);
    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { keycloakId: actor.sub },
    });
    if (user) {
      await this.recordAuth(
        user.id,
        user.id,
        AuditAction.PASSWORD_CHANGE,
        null,
      );
    }
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
   * - Thành công: ghi nhật ký LOGIN kèm identity provider
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
      { method: 'OIDC', provider },
    );
  }

  /**
   * Xác thực access token vừa cấp, bắt buộc tài khoản đã có row `users` đang hoạt động, ghi nhật ký LOGIN rồi trả token
   *
   * @param tokens Bộ token vừa nhận từ Keycloak
   * @param method Cách đăng nhập ghi vào nhật ký
   * @returns Promise trả về chính bộ token đã nhận
   * @throws UnauthorizedException Nếu token không hợp lệ, chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   */
  private async issueSession(
    tokens: AuthTokensResponseDto,
    method: Record<string, unknown>,
  ): Promise<AuthTokensResponseDto> {
    const claims = await this.keycloak.verifyToken(tokens.accessToken);
    const user = await this.provisioning.requireProvisionedUser(claims);
    await this.recordAuth(user.id, user.id, AuditAction.LOGIN, method);
    return tokens;
  }

  /**
   * Gỡ thiết bị push của tài khoản, lỗi thì chỉ ghi log warning
   *
   * @param userId UUID người dùng sở hữu thiết bị
   * @param deviceToken FCM registration token cần gỡ
   * @returns Promise hoàn tất khi lần gỡ kết thúc (thành công hoặc đã log lỗi)
   */
  private async removeDevice(
    userId: string,
    deviceToken: string,
  ): Promise<void> {
    try {
      await this.userDevices.removeUserDevice(userId, deviceToken);
    } catch {
      this.logger.warn(
        `Khong go duoc thiet bi push cua ${userId} khi dang xuat; thiet bi co the van nhan thong bao`,
      );
    }
  }

  /**
   * Ghi nhật ký LOGIN_FAILED cho tài khoản local có email trùng email đã nhập
   *
   * - Email không thuộc tài khoản local nào: không ghi
   *
   * @param email Email người dùng đã nhập
   * @returns Promise hoàn tất khi đã ghi (hoặc bỏ qua)
   */
  private async recordFailedLogin(email: string): Promise<void> {
    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { email: email.trim().toLowerCase() },
    });
    if (user) {
      await this.recordAuth(null, user.id, AuditAction.LOGIN_FAILED, {
        method: 'PASSWORD',
      });
    }
  }

  /**
   * Ghi một dòng nhật ký đăng nhập, đăng xuất hoặc đổi mật khẩu trên tài khoản
   *
   * @param actorId ID tài khoản thực hiện, null khi chưa xác thực được
   * @param userId ID tài khoản bị tác động
   * @param action Hành động ghi nhật ký
   * @param after Thông tin kèm theo, null nếu không có
   * @returns Promise hoàn tất khi đã ghi
   */
  private recordAuth(
    actorId: string | null,
    userId: string,
    action: AuditAction,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    return this.audit.record(this.dataSource.manager, {
      actorId,
      action,
      entityType: AuditEntityType.USER,
      entityId: userId,
      before: null,
      after,
      feature: AuditFeature.AUTH,
    });
  }
}
