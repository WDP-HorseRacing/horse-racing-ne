import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../user.enums';

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

  async requireProvisionedUser(
    claims: ProvisioningClaims,
  ): Promise<UserEntity> {
    const user = await this.users.findOneBy({ keycloakId: claims.sub });
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
