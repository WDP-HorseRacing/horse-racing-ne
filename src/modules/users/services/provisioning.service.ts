import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { lookupAccount } from '../utils/current-user';

export interface ProvisioningClaims {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

@Injectable()
export class ProvisioningService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /**
   * Bắt buộc tài khoản Keycloak vừa đăng nhập đã được Club Manager cấp tài khoản local và đang hoạt động
   *
   * - Dùng ở cửa đăng nhập (login, OIDC callback) và GET /auth/me
   *
   * @param claims Claim đọc từ access token, cần sub là Keycloak ID
   * @returns Promise trả về tài khoản local đang hoạt động
   * @throws UnauthorizedException Nếu chưa có tài khoản local hoặc tài khoản không ở trạng thái hoạt động
   */
  async requireProvisionedUser(
    claims: ProvisioningClaims,
  ): Promise<UserEntity> {
    const account = await lookupAccount(this.users.manager, claims.sub);
    if (account.kind === 'NOT_FOUND') {
      throw new UnauthorizedException(
        'Tài khoản chưa được cấp. Vui lòng liên hệ Quản lý câu lạc bộ.',
      );
    }
    if (account.kind === 'INACTIVE') {
      throw new UnauthorizedException(
        'Tài khoản không ở trạng thái hoạt động. Vui lòng liên hệ Quản lý câu lạc bộ.',
      );
    }
    return account.user;
  }
}
