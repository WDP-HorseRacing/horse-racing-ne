import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Not, Repository } from 'typeorm';
import { HorseOwnershipEntity } from '../../horses/entities/horse-ownership.entity';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { StallAssignmentEntity } from '../../stable/entities/stall-assignment.entity';
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
   * Find a user by id
   * @param id The ID of the user
   * @returns A promise resolving to the user, or null if not found
   */
  findById(id: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ id });
  }

  /**
   * List users
   * @param query The query parameters
   * @returns A promise resolving to an array of users and the total count
   */
  list(query: UserListQueryDto): Promise<[UserEntity[], number]> {
    const qb = this.repository.createQueryBuilder('user');
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
   * Find a user by email
   * @param email The email of the user
   * @returns A promise resolving to the user, or null if not found
   */
  findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOneBy({ email });
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
   * Update selected fields of a user
   * @param id The ID of the user
   * @param changes The fields to update
   * @param manager The entity manager to run the update with, defaults to the repository manager
   * @returns A promise resolving once the update is applied
   */
  async updateFields(
    id: string,
    changes: Partial<UserEntity>,
    manager: EntityManager = this.repository.manager,
  ): Promise<void> {
    await manager.getRepository(UserEntity).update({ id }, changes);
  }

  /**
   * Count the active club managers, excluding one user
   * @param excludeUserId The ID of the user to exclude from the count
   * @param manager The entity manager to run the query with, defaults to the repository manager
   * @returns A promise resolving to the number of other active club managers
   */
  countOtherActiveManagers(
    excludeUserId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<number> {
    return manager.getRepository(UserEntity).count({
      where: {
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
   * Check whether a user still has an open stall assignment as a groom
   * @param userId The ID of the user
   * @param manager The entity manager to run the query with, defaults to the repository manager
   * @returns A promise resolving to true if an active stall assignment exists
   */
  hasActiveStallAssignment(
    userId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<boolean> {
    return manager.getRepository(StallAssignmentEntity).existsBy({
      groomId: userId,
      endAt: IsNull(),
    });
  }

  /**
   * Check whether a user still leads a barn
   * @param userId The ID of the user
   * @param manager The entity manager to run the query with
   * @returns A promise resolving to true if the user is the head trainer of a barn that is not deleted
   */
  hasActiveBarn(
    userId: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<boolean> {
    return manager.getRepository(BarnEntity).existsBy({
      headTrainerId: userId,
    });
  }

  /**
   * Lock the active club manager rows so concurrent role or status changes cannot remove the last active manager
   * @param manager The entity manager of the current transaction
   * @returns A promise resolving once the rows are locked
   */
  async lockActiveManagers(manager: EntityManager): Promise<void> {
    await manager.getRepository(UserEntity).find({
      select: { id: true },
      where: { role: UserRole.CLUB_MANAGER, status: UserStatus.ACTIVE },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
