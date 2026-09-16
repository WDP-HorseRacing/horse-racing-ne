import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UsersRepository } from '../repositories/users.repository';
import { UserStatus } from '../user.enums';
import { deriveUsername } from '../utils/name';

/**
 * Phan claim toi thieu du de dung mot row `users`. Co y KHONG dung
 * KeycloakAccessTokenClaims: `Actor` (da bo cac claim ky thuat) cung phai
 * truyen vao duoc, vi /auth/me chi cam Actor trong tay.
 */
export interface ProvisioningClaims {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

/** users.full_name la varchar(160) NOT NULL. */
const FULL_NAME_MAX_LENGTH = 160;

@Injectable()
export class ProvisioningService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Tạo hoặc cập nhật hồ sơ người dùng dựa trên các claim từ token đã xác minh.
   * - Nếu hồ sơ người dùng đã tồn tại, cập nhật email, full_name và updated_at.
   * - Nếu hồ sơ người dùng chưa tồn tại, tạo một hồ sơ mới với trạng thái PENDING.
   * @param claims Clam từ token verified
   * @returns hồ sơ user trong db
   */
  async ensureUser(claims: ProvisioningClaims): Promise<UserEntity> {
    const email = claims.email ?? claims.preferred_username;
    if (!email) {
      throw new UnauthorizedException('Token khong chua email');
    }
    await this.dataSource.query(
      `INSERT INTO users (id, keycloak_id, email, full_name, status,
                          created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, $5, now(), now(), 1)
       ON CONFLICT (keycloak_id) WHERE deleted_at IS NULL
       DO UPDATE SET email = EXCLUDED.email,
                     full_name = EXCLUDED.full_name,
                     updated_at = now()`,
      [
        randomUUID(),
        claims.sub,
        email,
        this.resolveFullName(claims, email),
        UserStatus.PENDING,
      ],
    );

    const user = await this.users.findByKeycloakId(claims.sub);
    if (!user) {
      throw new UnauthorizedException('Khong tao duoc ho so nguoi dung');
    }
    return user;
  }

  private resolveFullName(claims: ProvisioningClaims, email: string): string {
    const candidate =
      claims.name?.trim() ||
      claims.preferred_username?.trim() ||
      deriveUsername({ email });
    return candidate.slice(0, FULL_NAME_MAX_LENGTH);
  }
}
