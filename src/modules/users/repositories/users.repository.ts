import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserListQueryDto } from '../dto/user-list-query.dto';
import { UserRole, UserStatus } from '../user.enums';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findById(id: string, clubId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ id, clubId });
  }

  listByClub(
    clubId: string,
    query: UserListQueryDto,
  ): Promise<[UserEntity[], number]> {
    const qb = this.repository
      .createQueryBuilder('user')
      .where('user.clubId = :clubId', { clubId });
    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }
    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(user.fullName ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    return qb
      .orderBy('user.fullName', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
  }

  findByEmail(email: string, clubId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ email, clubId });
  }

  findByKeycloakId(keycloakId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ keycloakId });
  }

  create(user: Partial<UserEntity>): Promise<UserEntity> {
    return this.repository.save(this.repository.create(user));
  }

  async updateFields(
    id: string,
    clubId: string,
    changes: Partial<UserEntity>,
    manager: EntityManager = this.repository.manager,
  ): Promise<void> {
    await manager.getRepository(UserEntity).update({ id, clubId }, changes);
  }

  countOtherActiveManagers(
    clubId: string,
    excludeUserId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<number> {
    return manager.getRepository(UserEntity).count({
      where: {
        clubId,
        id: Not(excludeUserId),
        role: UserRole.CLUB_MANAGER,
        status: UserStatus.ACTIVE,
      },
    });
  }

  async hasActiveOwnership(userId: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.repository.query(
      `SELECT EXISTS (SELECT 1 FROM horse_ownerships WHERE owner_id = $1 AND end_date IS NULL) AS exists`,
      [userId],
    );
    return rows[0]?.exists === true;
  }

  async hasActiveStableAssignment(userId: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.repository.query(
      `SELECT EXISTS (SELECT 1 FROM stable_assignments WHERE groom_id = $1 AND end_at IS NULL) AS exists`,
      [userId],
    );
    return rows[0]?.exists === true;
  }
}
