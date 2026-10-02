import type { KeycloakTokenResponse } from '../../../common/infrastructure/keycloak/types/token';
import type { Actor } from '../../../common/types/actor';
import type { UserEntity } from '../../users/entities/user.entity';
import { AuthTokensResponseDto } from '../dto/auth-tokens.response.dto';
import { CurrentUserResponseDto } from '../dto/current-user.response.dto';

/**
 * Ánh xạ token Keycloak cấp sang response đăng nhập
 *
 * @param tokens Token Keycloak trả về
 * @returns AuthTokensResponseDto
 */
export function toAuthTokensResponse(
  tokens: KeycloakTokenResponse,
): AuthTokensResponseDto {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    tokenType: tokens.token_type,
  };
}

/**
 * Ánh xạ người dùng hiện tại sang response, kèm các vai trò trong token
 *
 * @param user Người dùng đã có trong hệ thống
 * @param actor Thông tin danh tính từ Access Token
 * @returns CurrentUserResponseDto
 */
export function toCurrentUserResponse(
  user: UserEntity,
  actor: Actor,
): CurrentUserResponseDto {
  return {
    userId: user.id,
    role: user.role,
    status: user.status,
    email: user.email,
    fullName: user.fullName,
    roles: actor.roles,
  };
}
