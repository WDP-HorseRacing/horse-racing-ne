import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UsersRepository } from '../repositories/users.repository';
import { UserStatus } from '../user.enums';

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
   * Idempotent: goi bao nhieu lan cung chi ra dung mot row.
   *
   * Raw query chu khong phai .orUpdate() cua TypeORM: `users_keycloak_id_uq`
   * la index PARTIAL (`WHERE deleted_at IS NULL`), ma query builder khong gan
   * duoc menh de WHERE vao conflict target - Postgres se tra "no unique or
   * exclusion constraint matching the ON CONFLICT specification".
   *
   * ON CONFLICT lo luon race condition: hai request dang nhap song song thi
   * mot cai INSERT, cai con lai roi xuong nhanh UPDATE.
   */
  async ensureUser(claims: ProvisioningClaims): Promise<UserEntity> {
    const email = claims.email ?? claims.preferred_username;
    if (!email) {
      throw new UnauthorizedException('Token khong chua email');
    }

    // DO UPDATE chi cham email va full_name. status/role/club_id la du lieu
    // quan tri da gan - ghi de len chung se ha mot nguoi dang ACTIVE ve
    // PENDING ngay lan dang nhap ke tiep.
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
      // Chi xay ra neu row vua ghi bi xoa mem xen giua. Khong che giau bang
      // mot row gia: goi lai /auth/me la co lai.
      throw new UnauthorizedException('Khong tao duoc ho so nguoi dung');
    }
    return user;
  }

  private resolveFullName(claims: ProvisioningClaims, email: string): string {
    const candidate =
      claims.name?.trim() ||
      claims.preferred_username?.trim() ||
      email.split('@')[0];
    return candidate.slice(0, FULL_NAME_MAX_LENGTH);
  }
}
