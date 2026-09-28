import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipEntity } from '../../horses/entities/horse-ownership.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { findReadableHorse } from '../../horses/utils/horse-access';
import {
  assertTrainerBarn,
  isHorseInTrainerBarn,
} from '../../stable/utils/trainer-barn';
import { UserEntity } from '../../users/entities/user.entity';
import { UserRole, UserStatus } from '../../users/user.enums';
import {
  CurrentActorUser,
  currentUserForActor,
} from '../../users/utils/current-user';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';

@Injectable()
export class TrainingAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async currentUser(
    actor: Actor,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CurrentActorUser> {
    const caller = await currentUserForActor(manager, actor);
    if (!caller || caller.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản không hoạt động.');
    }
    return caller;
  }

  async readableHorseForActor(
    actor: Actor,
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ user: UserEntity; horse: HorseEntity }> {
    const user = await this.currentUser(actor, manager);
    const horse = await findReadableHorse(manager, actor, user.id, horseId);
    return { user, horse };
  }

  async horseForActor(
    actor: Actor,
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ user: UserEntity; horse: HorseEntity }> {
    const user = await this.currentUser(actor, manager);
    return { user, horse: await this.findHorse(manager, horseId) };
  }

  seesPlanGoal(actor: Actor): boolean {
    return (
      !actor.roles.includes(UserRole.GROOM) ||
      actor.roles.some((role) =>
        [
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.VETERINARIAN,
          UserRole.HORSE_OWNER,
        ].includes(role),
      )
    );
  }

  async findHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity> {
    const horse = await manager.findOneBy(HorseEntity, { id: horseId });
    if (!horse) throw new NotFoundException('Ngựa không tồn tại.');
    return horse;
  }

  async lockedHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity> {
    const horse = await manager.findOne(HorseEntity, {
      where: { id: horseId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  async findTrainingClass(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingClassEntity> {
    const row = await manager.findOne(TrainingClassEntity, {
      where: { id },
      relations: { headTrainer: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy training class');
    return row;
  }

  async canReadClass(
    actor: Actor,
    callerId: string,
    trainingClass: TrainingClassEntity,
    manager: EntityManager,
  ): Promise<boolean> {
    if (
      actor.roles.includes(UserRole.CLUB_MANAGER) ||
      actor.roles.includes(UserRole.VETERINARIAN)
    ) {
      return true;
    }
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      if (trainingClass.headTrainerId === callerId) return true;
    }
    if (actor.roles.includes(UserRole.HORSE_OWNER)) {
      return (
        (await manager
          .getRepository(HorseEnrollmentEntity)
          .createQueryBuilder('enrollment')
          .innerJoin(
            HorseOwnershipEntity,
            'ownership',
            'ownership.horse_id = enrollment.horse_id',
          )
          .where('enrollment.class_id = :classId', {
            classId: trainingClass.id,
          })
          .andWhere('ownership.owner_id = :callerId', { callerId })
          .andWhere('ownership.end_at IS NULL')
          .getCount()) > 0
      );
    }
    if (actor.roles.includes(UserRole.GROOM)) {
      return (
        (await manager
          .getRepository(SessionParticipantEntity)
          .createQueryBuilder('participant')
          .innerJoin(
            TrainingSessionEntity,
            'session',
            'session.id = participant.session_id',
          )
          .innerJoin(TrainingPlanEntity, 'plan', 'plan.id = session.plan_id')
          .where('plan.class_id = :classId', {
            classId: trainingClass.id,
          })
          .andWhere('participant.assigned_groom_id = :callerId', {
            callerId,
          })
          .getCount()) > 0
      );
    }
    return false;
  }

  async assertCanReadClass(
    actor: Actor,
    classId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingClassEntity> {
    const caller = await this.currentUser(actor, manager);
    const trainingClass = await this.findTrainingClass(manager, classId);
    if (!(await this.canReadClass(actor, caller.id, trainingClass, manager))) {
      throw new NotFoundException('Không tìm thấy training class');
    }
    return trainingClass;
  }

  async lockedTrainingClass(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingClassEntity> {
    const row = await manager.findOne(TrainingClassEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) throw new NotFoundException('Không tìm thấy training class');
    return row;
  }

  async findPlan(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id },
      relations: { trainingClass: true },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy giáo án');
    return plan;
  }

  async lockedPlan(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id },
      relations: { trainingClass: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy plan');
    return plan;
  }

  async planForActor(
    actor: Actor,
    planId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingPlanEntity> {
    const plan = await this.findPlan(manager, planId);
    const caller = await this.currentUser(actor, manager);
    if (
      !(await this.canReadClass(actor, caller.id, plan.trainingClass, manager))
    ) {
      throw new NotFoundException('Không tìm thấy giáo án');
    }
    return plan;
  }

  async findSession(
    manager: EntityManager,
    sessionId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      relations: { plan: { trainingClass: true } },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    return session;
  }

  async lockedSession(
    manager: EntityManager,
    sessionId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    return session;
  }

  async sessionForActor(
    actor: Actor,
    sessionId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingSessionEntity> {
    const session = await this.findSession(manager, sessionId);
    const caller = await this.currentUser(actor, manager);
    if (
      !(await this.canReadClass(
        actor,
        caller.id,
        session.plan.trainingClass,
        manager,
      ))
    ) {
      throw new NotFoundException('Không tìm thấy buổi tập');
    }
    return session;
  }

  async findParticipant(
    manager: EntityManager,
    participantId: string,
  ): Promise<SessionParticipantEntity> {
    const participant = await manager.findOne(SessionParticipantEntity, {
      where: { id: participantId },
      relations: {
        session: { plan: { trainingClass: true } },
        horse: true,
        horseEnrollment: true,
      },
    });
    if (!participant) throw new NotFoundException('Không tìm thấy participant');
    return participant;
  }

  async lockedParticipant(
    manager: EntityManager,
    participantId: string,
  ): Promise<SessionParticipantEntity> {
    const participant = await manager.findOne(SessionParticipantEntity, {
      where: { id: participantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!participant) throw new NotFoundException('Không tìm thấy participant');
    return participant;
  }

  async findEnrollment(
    manager: EntityManager,
    enrollmentId: string,
  ): Promise<HorseEnrollmentEntity> {
    const row = await manager.findOne(HorseEnrollmentEntity, {
      where: { id: enrollmentId },
      relations: { trainingClass: true, horse: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy horse enrollment');
    return row;
  }

  async canReadEnrollment(
    actor: Actor,
    callerId: string,
    enrollment: HorseEnrollmentEntity,
    manager: EntityManager,
  ): Promise<boolean> {
    if (
      actor.roles.includes(UserRole.CLUB_MANAGER) ||
      actor.roles.includes(UserRole.VETERINARIAN)
    ) {
      return true;
    }
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      if (
        enrollment.trainingClass?.headTrainerId === callerId &&
        (await isHorseInTrainerBarn(manager, enrollment.horseId, callerId))
      ) {
        return true;
      }
    }
    if (actor.roles.includes(UserRole.HORSE_OWNER)) {
      return manager.existsBy(HorseOwnershipEntity, {
        horseId: enrollment.horseId,
        ownerId: callerId,
        endAt: IsNull(),
      });
    }
    if (actor.roles.includes(UserRole.GROOM)) {
      return manager.getRepository(SessionParticipantEntity).existsBy({
        horseEnrollmentId: enrollment.id,
        assignedGroomId: callerId,
      });
    }
    return false;
  }

  async assertCanReadParticipant(
    actor: Actor,
    participantId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<SessionParticipantEntity> {
    const participant = await this.findParticipant(manager, participantId);
    const caller = await this.currentUser(actor, manager);
    if (
      !(await this.canReadParticipant(actor, caller.id, participant, manager))
    ) {
      throw new NotFoundException('Không tìm thấy participant');
    }
    return participant;
  }

  async canReadParticipant(
    actor: Actor,
    callerId: string,
    participant: SessionParticipantEntity,
    manager: EntityManager,
  ): Promise<boolean> {
    if (
      actor.roles.includes(UserRole.CLUB_MANAGER) ||
      actor.roles.includes(UserRole.VETERINARIAN)
    ) {
      return true;
    }
    if (actor.roles.includes(UserRole.GROOM)) {
      if (participant.assignedGroomId === callerId) return true;
    }
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      if (
        participant.session.plan.trainingClass.headTrainerId === callerId &&
        (await isHorseInTrainerBarn(manager, participant.horseId, callerId))
      ) {
        return true;
      }
    }
    if (actor.roles.includes(UserRole.HORSE_OWNER)) {
      return manager.existsBy(HorseOwnershipEntity, {
        horseId: participant.horseId,
        ownerId: callerId,
        endAt: IsNull(),
      });
    }
    return false;
  }

  async assertCanReadSession(
    actor: Actor,
    sessionId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingSessionEntity> {
    const session = await this.findSession(manager, sessionId);
    const caller = await this.currentUser(actor, manager);
    if (
      !(await this.canReadClass(
        actor,
        caller.id,
        session.plan.trainingClass,
        manager,
      ))
    ) {
      throw new NotFoundException('Không tìm thấy buổi tập');
    }
    return session;
  }

  async assertGroom(
    manager: EntityManager,
    groomId: string,
  ): Promise<UserEntity> {
    const groom = await manager.findOne(UserEntity, {
      where: { id: groomId, role: UserRole.GROOM, status: UserStatus.ACTIVE },
    });
    if (!groom) throw new BadRequestException('Groom không hợp lệ');
    return groom;
  }

  async assertHeadTrainer(
    manager: EntityManager,
    headTrainerId: string,
  ): Promise<UserEntity> {
    const trainer = await manager.findOne(UserEntity, {
      where: {
        id: headTrainerId,
        role: UserRole.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
      },
    });
    if (!trainer) throw new BadRequestException('Head trainer không hợp lệ');
    return trainer;
  }

  async assertTrainerBarn(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<void> {
    await assertTrainerBarn(manager, actor, callerId, horseId);
  }

  assertCanManageClass(
    actor: Actor,
    callerId: string,
    headTrainerId: string | null,
  ): void {
    if (actor.roles.includes(UserRole.CLUB_MANAGER)) return;
    if (!actor.roles.includes(UserRole.HEAD_TRAINER)) {
      throw new ForbiddenException('Không có quyền quản lý training class');
    }
    if (!headTrainerId) {
      throw new ForbiddenException(
        'Class phải được phân công cho head trainer trước khi thao tác',
      );
    }
    if (headTrainerId !== callerId) {
      throw new ForbiddenException('Class thuộc head trainer khác');
    }
  }

  async assertCanOperateParticipant(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    participant: SessionParticipantEntity,
  ): Promise<void> {
    if (actor.roles.includes(UserRole.CLUB_MANAGER)) return;
    if (actor.roles.includes(UserRole.GROOM)) {
      if (participant.assignedGroomId !== callerId) {
        throw new ForbiddenException('Bạn không được assign participant này');
      }
      return;
    }
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      if (participant.session.plan.trainingClass.headTrainerId !== callerId) {
        throw new ForbiddenException(
          'Participant thuộc class của head trainer khác',
        );
      }
      await this.assertTrainerBarn(
        manager,
        actor,
        callerId,
        participant.horseId,
      );
      return;
    }
    throw new ForbiddenException('Bạn không được thao tác participant này');
  }

  async assertCanOperateSession(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    session: TrainingSessionEntity,
  ): Promise<void> {
    if (actor.roles.includes(UserRole.CLUB_MANAGER)) return;
    const participants = await manager.find(SessionParticipantEntity, {
      where: { sessionId: session.id },
    });
    if (actor.roles.includes(UserRole.GROOM)) {
      if (!participants.some((item) => item.assignedGroomId === callerId)) {
        throw new ForbiddenException('Bạn không được assign participant nào');
      }
      return;
    }
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      for (const participant of participants) {
        await this.assertTrainerBarn(
          manager,
          actor,
          callerId,
          participant.horseId,
        );
      }
      return;
    }
    throw new ForbiddenException('Bạn không được thao tác buổi tập này');
  }
}
