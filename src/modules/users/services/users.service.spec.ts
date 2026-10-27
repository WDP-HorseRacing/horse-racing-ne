import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { KeycloakUserService } from '../../../common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../common/types/actor';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { READ_ONLY_LIFECYCLE_STATUSES } from '../../horses/constants/horse.constants';
import { CareScheduleStatus } from '../../medical/constants/care-schedule.enum';
import { CareScheduleEntity } from '../../medical/entities/care-schedule.entity';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
import { TrainingClassEntity } from '../../training/entities/training-class.entity';
import { TrainingPlanEntity } from '../../training/entities/training-plan.entity';
import { TrainingClassStatus } from '../../training/enums/training-class-status.enum';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../../training/enums/training-session-status.enum';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { UserEntity } from '../entities/user.entity';
import { UserRole, UserStatus } from '../user.enums';
import { UsersService } from './users.service';

type TargetUser = Pick<
  UserEntity,
  'id' | 'keycloakId' | 'fullName' | 'email' | 'role' | 'status'
>;

describe('UsersService', () => {
  const callerId = 'manager-1';
  const owner: TargetUser = {
    id: 'owner-1',
    keycloakId: 'kc-owner',
    fullName: 'Chu Ngua',
    email: 'owner@example.com',
    role: UserRole.HORSE_OWNER,
    status: UserStatus.ACTIVE,
  };
  const otherManager: TargetUser = {
    id: 'manager-2',
    keycloakId: 'kc-manager-2',
    fullName: 'Quan Ly Hai',
    email: 'manager2@example.com',
    role: UserRole.CLUB_MANAGER,
    status: UserStatus.ACTIVE,
  };

  let events: string[];
  let actor: Actor;
  let target: TargetUser | null;
  let horseRepository: { existsBy: jest.Mock };
  let groomRepository: { existsBy: jest.Mock };
  let barnRepository: { existsBy: jest.Mock };
  let planRepository: { existsBy: jest.Mock };
  let classRepository: { existsBy: jest.Mock };
  let careScheduleRepository: { count: jest.Mock };
  let participantRepository: { count: jest.Mock };
  let userRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let getRepository: jest.Mock;
  let transaction: jest.Mock;
  let keycloakUsers: {
    removeRealmRole: jest.Mock;
    assignRealmRole: jest.Mock;
    setUserEnabled: jest.Mock;
    logoutUser: jest.Mock;
  };
  let users: { findOneBy: jest.Mock };
  let realtime: { disconnectUser: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    events = [];
    actor = { sub: 'kc-manager', roles: [UserRole.CLUB_MANAGER] };
    target = { ...owner };
    const exists = (name: string) =>
      jest.fn(() => {
        events.push(`exists:${name}`);
        return Promise.resolve(false);
      });
    horseRepository = { existsBy: exists('horse') };
    groomRepository = { existsBy: exists('groom') };
    barnRepository = { existsBy: exists('barn') };
    planRepository = { existsBy: exists('plan') };
    classRepository = { existsBy: exists('class') };
    careScheduleRepository = { count: jest.fn().mockResolvedValue(0) };
    participantRepository = { count: jest.fn().mockResolvedValue(0) };
    userRepository = {
      findOne: jest.fn(() => {
        events.push('lock:user');
        return Promise.resolve(target ? { ...target } : null);
      }),
      find: jest.fn(() => {
        events.push('lock:managers');
        return Promise.resolve([]);
      }),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn(() => {
        events.push('db:update');
        return Promise.resolve({ affected: 1 });
      }),
    };
    getRepository = jest.fn((entity: unknown) => {
      if (entity === HorseEntity) return horseRepository;
      if (entity === GroomAssignmentEntity) return groomRepository;
      if (entity === BarnEntity) return barnRepository;
      if (entity === TrainingPlanEntity) return planRepository;
      if (entity === TrainingClassEntity) return classRepository;
      if (entity === CareScheduleEntity) return careScheduleRepository;
      if (entity === SessionParticipantEntity) return participantRepository;
      if (entity === UserEntity) return userRepository;
      throw new Error('Unexpected repository');
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: callerId,
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      }),
      getRepository,
    };
    transaction = jest.fn(
      async (work: (m: typeof manager) => Promise<unknown>) => {
        events.push('tx:begin');
        const result = await work(manager);
        events.push('tx:commit');
        return result;
      },
    );
    const keycloak = (name: string) =>
      jest.fn(() => {
        events.push(`keycloak:${name}`);
        return Promise.resolve(undefined);
      });
    keycloakUsers = {
      removeRealmRole: keycloak('removeRole'),
      assignRealmRole: keycloak('assignRole'),
      setUserEnabled: keycloak('setEnabled'),
      logoutUser: keycloak('logout'),
    };
    users = { findOneBy: jest.fn(() => Promise.resolve({ ...target })) };
    realtime = {
      disconnectUser: jest.fn(() => {
        events.push('realtime:disconnect');
      }),
    };
    service = new UsersService(
      users as unknown as Repository<UserEntity>,
      keycloakUsers as unknown as KeycloakUserService,
      { manager, transaction } as unknown as DataSource,
      { record: jest.fn() },
      realtime as unknown as RealtimeGateway,
    );
  });

  describe('update', () => {
    it('returns 404 when the user does not exist', async () => {
      target = null;

      await expect(
        service.update(actor, 'missing', { role: UserRole.GROOM }),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.assignRealmRole).not.toHaveBeenCalled();
    });

    it('returns 400 when the caller changes their own role', async () => {
      target = { ...otherManager, id: callerId };

      await expect(
        service.update(actor, callerId, { role: UserRole.GROOM }),
      ).rejects.toThrow(BadRequestException);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 409 while the owner still owns a horse whose profile is writable', async () => {
      horseRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.update(actor, owner.id, { role: UserRole.GROOM }),
      ).rejects.toThrow(ConflictException);
      expect(horseRepository.existsBy).toHaveBeenCalledWith({
        ownerId: owner.id,
        lifecycleStatus: Not(In([...READ_ONLY_LIFECYCLE_STATUSES])),
      });
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.assignRealmRole).not.toHaveBeenCalled();
    });

    it('returns 409 while the groom still cares for a horse', async () => {
      target = { ...owner, role: UserRole.GROOM };
      groomRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.update(actor, owner.id, { role: UserRole.HORSE_OWNER }),
      ).rejects.toThrow(ConflictException);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when changing the role of a groom still assigned to lead future runs', async () => {
      target = { ...owner, role: UserRole.GROOM };
      participantRepository.count.mockResolvedValue(1);

      await expect(
        service.update(actor, owner.id, { role: UserRole.HORSE_OWNER }),
      ).rejects.toThrow(
        new ConflictException(
          'Người này còn 1 lượt tập được giao dắt chưa diễn ra, cần nhờ Huấn luyện viên trưởng giao lại trước khi đổi vai trò',
        ),
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 409 while the head trainer still runs a barn', async () => {
      target = { ...owner, role: UserRole.HEAD_TRAINER };
      barnRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.update(actor, owner.id, { role: UserRole.GROOM }),
      ).rejects.toThrow(ConflictException);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when demoting the last active club manager', async () => {
      target = { ...otherManager };
      userRepository.count.mockResolvedValue(0);

      await expect(
        service.update(actor, otherManager.id, { role: UserRole.GROOM }),
      ).rejects.toThrow(ConflictException);
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.assignRealmRole).not.toHaveBeenCalled();
    });

    it('locks the user inside the transaction before checking role responsibilities', async () => {
      await service.update(actor, owner.id, { role: UserRole.GROOM });

      expect(events.slice(0, 4)).toEqual([
        'tx:begin',
        'lock:managers',
        'lock:user',
        'exists:horse',
      ]);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: owner.id },
        lock: { mode: 'for_no_key_update' },
      });
    });

    it('calls Keycloak only after the role change is committed', async () => {
      await service.update(actor, owner.id, { role: UserRole.GROOM });

      expect(events).toEqual([
        'tx:begin',
        'lock:managers',
        'lock:user',
        'exists:horse',
        'db:update',
        'tx:commit',
        'keycloak:removeRole',
        'keycloak:assignRole',
        'keycloak:logout',
      ]);
      expect(keycloakUsers.assignRealmRole).toHaveBeenCalledWith(
        owner.keycloakId,
        UserRole.GROOM,
      );
    });

    it('reverts the committed role when Keycloak fails and rethrows the Keycloak error', async () => {
      const keycloakError = new Error('keycloak down');
      keycloakUsers.assignRealmRole.mockRejectedValue(keycloakError);

      await expect(
        service.update(actor, owner.id, { role: UserRole.GROOM }),
      ).rejects.toBe(keycloakError);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(userRepository.update).toHaveBeenLastCalledWith(
        { id: owner.id, role: UserRole.GROOM },
        { role: UserRole.HORSE_OWNER },
      );
      expect(keycloakUsers.logoutUser).not.toHaveBeenCalled();
    });

    it('gives the old role back on Keycloak when assigning the new role fails', async () => {
      const keycloakError = new Error('keycloak down');
      keycloakUsers.assignRealmRole.mockRejectedValueOnce(keycloakError);

      await expect(
        service.update(actor, owner.id, { role: UserRole.GROOM }),
      ).rejects.toBe(keycloakError);
      expect(keycloakUsers.removeRealmRole).toHaveBeenCalledWith(
        owner.keycloakId,
        UserRole.HORSE_OWNER,
      );
      expect(keycloakUsers.assignRealmRole).toHaveBeenLastCalledWith(
        owner.keycloakId,
        UserRole.HORSE_OWNER,
      );
    });

    it('logs the Keycloak user to fix by hand when giving the old role back also fails', async () => {
      const keycloakError = new Error('keycloak down');
      keycloakUsers.assignRealmRole
        .mockRejectedValueOnce(keycloakError)
        .mockRejectedValueOnce(new Error('still down'));
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.update(actor, owner.id, { role: UserRole.GROOM }),
      ).rejects.toBe(keycloakError);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining(owner.keycloakId),
      );
      logError.mockRestore();
    });

    it('logs an error when reverting the role also fails, still rethrowing the Keycloak error', async () => {
      const keycloakError = new Error('keycloak down');
      keycloakUsers.assignRealmRole.mockRejectedValue(keycloakError);
      userRepository.update
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('db down'));
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.update(actor, owner.id, { role: UserRole.GROOM }),
      ).rejects.toBe(keycloakError);
      expect(logError).toHaveBeenCalledWith(expect.stringContaining(owner.id));
      logError.mockRestore();
    });

    it('changes only the name without locking managers or calling Keycloak', async () => {
      await service.update(actor, owner.id, { fullName: '  Ten Moi  ' });

      expect(userRepository.find).not.toHaveBeenCalled();
      expect(horseRepository.existsBy).not.toHaveBeenCalled();
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: owner.id },
        { fullName: 'Ten Moi' },
      );
      expect(keycloakUsers.assignRealmRole).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('returns 404 when the user does not exist', async () => {
      target = null;

      await expect(
        service.setStatus(actor, 'missing', UserStatus.LOCKED),
      ).rejects.toThrow(NotFoundException);
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it('returns 400 when the caller changes their own status', async () => {
      target = { ...otherManager, id: callerId };

      await expect(
        service.setStatus(actor, callerId, UserStatus.LOCKED),
      ).rejects.toThrow(BadRequestException);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when locking the last active club manager', async () => {
      target = { ...otherManager };
      userRepository.count.mockResolvedValue(0);

      await expect(
        service.setStatus(actor, otherManager.id, UserStatus.LOCKED),
      ).rejects.toThrow(ConflictException);
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it.each([UserStatus.LOCKED, UserStatus.INACTIVE])(
      'returns 409 when setting %s on an owner who still owns a horse whose profile is writable',
      async (status) => {
        horseRepository.existsBy.mockResolvedValue(true);

        await expect(
          service.setStatus(actor, owner.id, status),
        ).rejects.toThrow(
          new ConflictException(
            'Người này đang là chủ của ngựa còn ở câu lạc bộ, cần đổi chủ trước khi khóa tài khoản',
          ),
        );
        expect(horseRepository.existsBy).toHaveBeenCalledWith({
          ownerId: owner.id,
          lifecycleStatus: Not(In([...READ_ONLY_LIFECYCLE_STATUSES])),
        });
        expect(userRepository.update).not.toHaveBeenCalled();
        expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
      },
    );

    it('returns 409 when locking a groom who still cares for a horse', async () => {
      target = { ...owner, role: UserRole.GROOM };
      groomRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(
        new ConflictException(
          'Người này đang phụ trách ngựa, cần giao ngựa cho groom khác trước khi khóa tài khoản',
        ),
      );
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it('returns 409 when locking a head trainer who still owns a training plan', async () => {
      target = { ...owner, role: UserRole.HEAD_TRAINER };
      planRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(
        new ConflictException(
          'Người này còn giáo án hoặc lớp huấn luyện chưa kết thúc, cần bàn giao cho Huấn luyện viên trưởng khác trước khi khóa tài khoản',
        ),
      );
      expect(planRepository.existsBy).toHaveBeenCalledWith({
        headTrainerId: owner.id,
      });
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it('returns 409 when locking a head trainer who still runs an active class', async () => {
      target = { ...owner, role: UserRole.HEAD_TRAINER };
      classRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(ConflictException);
      expect(classRepository.existsBy).toHaveBeenCalledWith({
        headTrainerId: owner.id,
        status: TrainingClassStatus.ACTIVE,
      });
    });

    it('locks a head trainer with no barn, plan or open class', async () => {
      target = { ...owner, role: UserRole.HEAD_TRAINER };

      await service.setStatus(actor, owner.id, UserStatus.LOCKED);

      expect(keycloakUsers.setUserEnabled).toHaveBeenCalled();
    });

    it('returns 409 when locking a head trainer who still runs a barn', async () => {
      target = { ...owner, role: UserRole.HEAD_TRAINER };
      barnRepository.existsBy.mockResolvedValue(true);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(
        new ConflictException(
          'Người này đang phụ trách khu chuồng, cần giao khu cho Huấn luyện viên trưởng khác trước khi khóa tài khoản',
        ),
      );
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it('checks responsibilities after locking managers and the user inside the transaction', async () => {
      target = { ...owner, role: UserRole.GROOM };
      groomRepository.existsBy.mockImplementation(() => {
        events.push('exists:groom');
        return Promise.resolve(true);
      });

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(ConflictException);
      expect(events).toEqual([
        'tx:begin',
        'lock:managers',
        'lock:user',
        'exists:groom',
      ]);
    });

    it('locks a user with no remaining responsibilities', async () => {
      target = { ...owner, role: UserRole.GROOM };

      await service.setStatus(actor, owner.id, UserStatus.LOCKED);

      expect(groomRepository.existsBy).toHaveBeenCalledWith({
        groomId: owner.id,
        endAt: IsNull(),
      });
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: owner.id },
        { status: UserStatus.LOCKED },
      );
      expect(keycloakUsers.setUserEnabled).toHaveBeenCalledWith(
        owner.keycloakId,
        false,
      );
    });

    it('refuses to lock a vet who still has open care schedules assigned by name', async () => {
      target = { ...owner, role: UserRole.VETERINARIAN };
      careScheduleRepository.count.mockResolvedValue(2);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(
        new ConflictException(
          'Người này còn 2 lịch chăm sóc được giao đích danh chưa làm, cần nhờ bác sĩ giao lại trước khi khóa tài khoản',
        ),
      );
      expect(careScheduleRepository.count).toHaveBeenCalledWith({
        where: { assignedTo: owner.id, status: CareScheduleStatus.SCHEDULED },
      });
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('refuses to lock a groom still assigned to lead runs that have not happened yet', async () => {
      target = { ...owner, role: UserRole.GROOM };
      participantRepository.count.mockResolvedValue(3);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toThrow(
        new ConflictException(
          'Người này còn 3 lượt tập được giao dắt chưa diễn ra, cần nhờ Huấn luyện viên trưởng giao lại trước khi khóa tài khoản',
        ),
      );
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it('counts only open runs of scheduled or in-progress sessions, ignoring ended or cancelled ones', async () => {
      target = { ...owner, role: UserRole.GROOM };

      await service.setStatus(actor, owner.id, UserStatus.LOCKED);

      expect(participantRepository.count).toHaveBeenCalledWith({
        where: {
          assignedGroomId: owner.id,
          status: In([
            SessionParticipantStatus.PLANNED,
            SessionParticipantStatus.PRESENT,
            SessionParticipantStatus.READY,
            SessionParticipantStatus.ONGOING,
          ]),
          session: {
            status: In([
              TrainingSessionStatus.SCHEDULED,
              TrainingSessionStatus.IN_PROGRESS,
            ]),
          },
        },
      });
      expect(keycloakUsers.setUserEnabled).toHaveBeenCalledWith(
        owner.keycloakId,
        false,
      );
    });

    it('does not check led runs for roles other than groom', async () => {
      target = { ...owner, role: UserRole.VETERINARIAN };

      await service.setStatus(actor, owner.id, UserStatus.LOCKED);

      expect(participantRepository.count).not.toHaveBeenCalled();
    });

    it('reactivates a locked user without checking responsibilities', async () => {
      target = { ...owner, status: UserStatus.LOCKED };
      horseRepository.existsBy.mockResolvedValue(true);

      await service.setStatus(actor, owner.id, UserStatus.ACTIVE);

      expect(horseRepository.existsBy).not.toHaveBeenCalled();
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: owner.id },
        { status: UserStatus.ACTIVE },
      );
      expect(keycloakUsers.setUserEnabled).toHaveBeenCalledWith(
        owner.keycloakId,
        true,
      );
      expect(realtime.disconnectUser).not.toHaveBeenCalled();
    });

    it('does nothing when the status is unchanged', async () => {
      await service.setStatus(actor, owner.id, UserStatus.ACTIVE);

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(keycloakUsers.setUserEnabled).not.toHaveBeenCalled();
    });

    it('calls Keycloak only after the status change is committed', async () => {
      await service.setStatus(actor, owner.id, UserStatus.LOCKED);

      expect(events).toEqual([
        'tx:begin',
        'lock:managers',
        'lock:user',
        'exists:horse',
        'db:update',
        'tx:commit',
        'keycloak:setEnabled',
        'keycloak:logout',
        'realtime:disconnect',
      ]);
      expect(keycloakUsers.setUserEnabled).toHaveBeenCalledWith(
        owner.keycloakId,
        false,
      );
      expect(realtime.disconnectUser).toHaveBeenCalledWith(owner.id);
    });

    it('reverts the committed status when Keycloak fails and rethrows the Keycloak error', async () => {
      const keycloakError = new Error('keycloak down');
      keycloakUsers.setUserEnabled.mockRejectedValue(keycloakError);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toBe(keycloakError);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(userRepository.update).toHaveBeenLastCalledWith(
        { id: owner.id, status: UserStatus.LOCKED },
        { status: UserStatus.ACTIVE },
      );
      expect(keycloakUsers.logoutUser).not.toHaveBeenCalled();
      expect(realtime.disconnectUser).not.toHaveBeenCalled();
    });

    it('logs an error when reverting the status also fails, still rethrowing the Keycloak error', async () => {
      const keycloakError = new Error('keycloak down');
      keycloakUsers.setUserEnabled.mockRejectedValue(keycloakError);
      userRepository.update
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('db down'));
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.setStatus(actor, owner.id, UserStatus.LOCKED),
      ).rejects.toBe(keycloakError);
      expect(logError).toHaveBeenCalledWith(expect.stringContaining(owner.id));
      logError.mockRestore();
    });
  });

  describe('create', () => {
    const body = {
      fullName: 'Nguoi Moi',
      email: ' Owner@Example.com ',
      role: UserRole.GROOM,
      password: 'Abc@12345',
    };
    const emailTaken = {
      status: 409,
      response: {
        errors: [
          {
            field: 'email',
            message: 'Email này đã được dùng cho tài khoản khác',
          },
        ],
      },
    };

    it('ties a duplicate email in the database to the email field', async () => {
      await expect(service.create(actor, body)).rejects.toMatchObject(
        emailTaken,
      );
    });

    it('ties a duplicate email on Keycloak to the email field', async () => {
      users.findOneBy.mockResolvedValueOnce(null);
      Object.assign(keycloakUsers, {
        registerUserWithPassword: jest
          .fn()
          .mockRejectedValue(new ConflictException('Keycloak user exists')),
      });

      await expect(service.create(actor, body)).rejects.toMatchObject(
        emailTaken,
      );
    });
  });
});
