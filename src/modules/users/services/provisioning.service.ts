import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserEntity } from '../entities/user.entity';
import { UsersRepository } from '../repositories/users.repository';
import { UserStatus } from '../user.enums';

export interface ProvisioningClaims {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

@Injectable()
export class ProvisioningService {
  constructor(private readonly users: UsersRepository) {}

  async requireProvisionedUser(
    claims: ProvisioningClaims,
  ): Promise<UserEntity> {
    const user = await this.users.findByKeycloakId(claims.sub);
    if (!user) {
      throw new UnauthorizedException(
        'Tài khoản chưa được cấp. Vui lòng liên hệ Club Manager.',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Tài khoản không ở trạng thái hoạt động. Vui lòng liên hệ Club Manager.',
      );
    }
    return user;
  }
}
