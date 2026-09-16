import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Not, Repository } from 'typeorm';
import { HorseOwnershipEntity } from '../../horses/entities/horse-ownership.entity';
import { StableAssignmentEntity } from '../../stable/entities/stable-assignment.entity';
import { UserListQueryDto } from '../dto/user-list-query.dto';
import { UserEntity } from '../entities/user.entity';
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

  hasActiveOwnership(
    userId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<boolean> {
    return manager.getRepository(HorseOwnershipEntity).existsBy({
      ownerId: userId,
      endDate: IsNull(),
    });
  }

  hasActiveStableAssignment(
    userId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<boolean> {
    return manager.getRepository(StableAssignmentEntity).existsBy({
      groomId: userId,
      endAt: IsNull(),
    });
  }
}
