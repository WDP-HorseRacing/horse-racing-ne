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

  /**
   * Find a user by id within a club
   * @param id The ID of the user
   * @param clubId The ID of the club
   * @returns A promise resolving to the user, or null if not found
   */
  findById(id: string, clubId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ id, clubId });
  }

  /**
   * List users by club
   * @param clubId The ID of the club
   * @param query The query parameters
   * @returns A promise resolving to an array of users and the total count
   */
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

  /**
   * Find a user by email within a club
   * @param email The email of the user
   * @param clubId The ID of the club
   * @returns A promise resolving to the user, or null if not found
   */
  findByEmail(email: string, clubId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ email, clubId });
  }

  /**
   * Find a user by their Keycloak identifier
   * @param keycloakId The Keycloak ID of the user
   * @returns A promise resolving to the user, or null if not found
   */
  findByKeycloakId(keycloakId: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ keycloakId });
  }

  /**
   * Create and persist a new user
   * @param user The user fields to persist
   * @returns A promise resolving to the created user
   */
  create(user: Partial<UserEntity>): Promise<UserEntity> {
    return this.repository.save(this.repository.create(user));
  }

  /**
   * Update selected fields of a user within a club
   * @param id The ID of the user
   * @param clubId The ID of the club
   * @param changes The fields to update
   * @param manager The entity manager to run the update with, defaults to the repository manager
   * @returns A promise resolving once the update is applied
   */
  async updateFields(
    id: string,
    clubId: string,
    changes: Partial<UserEntity>,
    manager: EntityManager = this.repository.manager,
  ): Promise<void> {
    await manager.getRepository(UserEntity).update({ id, clubId }, changes);
  }

  /**
   * Count the active club managers of a club, excluding one user
   * @param clubId The ID of the club
   * @param excludeUserId The ID of the user to exclude from the count
   * @param manager The entity manager to run the query with, defaults to the repository manager
   * @returns A promise resolving to the number of other active club managers
   */
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

  /**
   * Check whether a user still owns a horse with an open ownership record
   * @param userId The ID of the user
   * @param manager The entity manager to run the query with, defaults to the repository manager
   * @returns A promise resolving to true if an active ownership exists
   */
  hasActiveOwnership(
    userId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<boolean> {
    return manager.getRepository(HorseOwnershipEntity).existsBy({
      ownerId: userId,
      endDate: IsNull(),
    });
  }

  /**
   * Check whether a user still has an open stable assignment as a groom
   * @param userId The ID of the user
   * @param manager The entity manager to run the query with, defaults to the repository manager
   * @returns A promise resolving to true if an active stable assignment exists
   */
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
