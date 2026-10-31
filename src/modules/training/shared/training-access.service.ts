import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HORSE_NOT_FOUND_MESSAGE } from '../../horses/constants/horse.constants';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { assertLifecycleWritable } from '../../horses/policies/horse.policy';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { UserEntity } from '../../users/entities/user.entity';
import { UserRole, UserStatus } from '../../users/user.enums';
import {
  CurrentActorUser,
  currentUserForActor,
} from '../../users/utils/current-user';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  findGroomRunClashes,
  HORSE_SCHEDULE_SESSION_STATUSES,
} from '../policy/training.policy';
import { toGroomRun } from '../utils/groom-run';
import { TRAINED_PARTICIPANT_STATUSES } from '../constants/participant-window.constants';
import type {
  GroomRun,
  HeadTrainerSession,
  HorseBrief,
  HorseClassSession,
  HorseSessionHolding,
} from '../types/training-session.types';

const SEAT_HOLDING_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
  SessionParticipantStatus.ONGOING,
  SessionParticipantStatus.CANCELLED_BY_LOCK,
  SessionParticipantStatus.INELIGIBLE,
];

@Injectable()
export class TrainingAccessService {
  /**
   * Khởi tạo service kiểm tra quyền và truy vấn dữ liệu dùng chung cho huấn luyện
   *
   * @param dataSource DataSource dùng để lấy EntityManager mặc định
   * @param horseAccess Service kiểm tra phạm vi truy cập hồ sơ ngựa
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly horseAccess: HorseAccessService,
  ) {}

  /**
   * Lấy tên và mã ảnh đại diện của nhiều ngựa trong một câu truy vấn, kể cả ngựa đã xóa mềm
   *
   * @param horseIds UUID các ngựa cần lấy, có thể trùng nhau
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Promise trả về map từ UUID ngựa sang tên và mã ảnh, rỗng nếu không truyền ngựa nào
   */
  async horseBriefs(
    horseIds: string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, HorseBrief>> {
    if (horseIds.length === 0) return new Map();
    const horses = await manager.find(HorseEntity, {
      select: { id: true, name: true, mediaId: true },
      where: { id: In([...new Set(horseIds)]) },
      withDeleted: true,
    });
    return new Map(
      horses.map((horse) => [
        horse.id,
        { name: horse.name, mediaId: horse.mediaId },
      ]),
    );
  }

  /**
   * Lấy user hiện tại từ Actor và yêu cầu tài khoản đang hoạt động
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns User hiện tại đang hoạt động
   * @throws ForbiddenException Nếu không tìm thấy user hoặc tài khoản không hoạt động
   */
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

  /**
   * Lấy user hiện tại và con ngựa người gọi được xem
   *
   * - Phạm vi xem theo HorseAccessService.findReadableHorse: Club Manager xem được cả hồ sơ đã xóa, Horse Owner chỉ ngựa của mình, vai trò khác mọi ngựa chưa xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Promise trả về user hiện tại và con ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi xem của người gọi
   */
  async readableHorseForActor(
    actor: Actor,
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ user: UserEntity; horse: HorseEntity }> {
    const user = await this.currentUser(actor, manager);
    const horse = await this.horseAccess.findReadableHorse(
      manager,
      actor,
      user.id,
      horseId,
    );
    return { user, horse };
  }

  /**
   * Lấy user hiện tại đang hoạt động và tìm ngựa theo UUID
   *
   * - Chỉ kiểm tra tài khoản và sự tồn tại của ngựa; không kiểm phạm vi xem ngựa
   * - Dùng readableHorseForActor nếu cần áp dụng quyền xem hồ sơ ngựa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns User hiện tại và hồ sơ ngựa
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không tìm thấy ngựa
   */
  async horseForActor(
    actor: Actor,
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ user: UserEntity; horse: HorseEntity }> {
    const user = await this.currentUser(actor, manager);
    return { user, horse: await this.findHorse(manager, horseId) };
  }

  /**
   * Kiểm người gọi có được xem mục tiêu giáo án hay không
   *
   * - Người không có vai trò Groom được xem
   * - Người có Groom chỉ được xem nếu đồng thời có Club Manager, Head Trainer,
   *   Veterinarian hoặc Horse Owner
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @returns true nếu được xem mục tiêu giáo án
   */
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

  /**
   * Tìm hồ sơ ngựa theo UUID, không lấy hồ sơ đã xóa mềm
   *
   * @param manager EntityManager dùng để query
   * @param horseId UUID của ngựa
   * @returns Hồ sơ ngựa tìm được
   * @throws NotFoundException Nếu không tìm thấy ngựa
   */
  async findHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity> {
    const horse = await manager.findOneBy(HorseEntity, { id: horseId });
    if (!horse) throw new NotFoundException('Ngựa không tồn tại.');
    return horse;
  }

  /**
   * Khóa một hồ sơ ngựa để tuần tự hóa thao tác ghi trong transaction hiện tại
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa cần khóa
   * @returns Hồ sơ ngựa đã khóa
   * @throws NotFoundException Nếu không tìm thấy ngựa
   */
  async lockedHorse(
    manager: EntityManager,
    horseId: string,
  ): Promise<HorseEntity> {
    const horse = await manager.findOne(HorseEntity, {
      where: { id: horseId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
    return horse;
  }

  /**
   * Khóa nhiều con ngựa theo thứ tự UUID để các thao tác ghi lịch của cùng ngựa chạy tuần tự
   *
   * - Khóa cả ngựa đã xóa mềm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseIds UUID các ngựa cần khóa, không rỗng
   * @returns Promise hoàn tất khi đã khóa xong
   */
  async lockHorses(manager: EntityManager, horseIds: string[]): Promise<void> {
    await manager
      .createQueryBuilder(HorseEntity, 'horse')
      .withDeleted()
      .select('horse.id')
      .where('horse.id IN (:...horseIds)', { horseIds })
      .orderBy('horse.id', 'ASC')
      .setLock('for_no_key_update')
      .getMany();
  }

  /**
   * Lấy các buổi tập nhiều ngựa đang giữ chỗ ở những lớp khác trong một câu truy vấn
   *
   * - Lượt giữ chỗ: PLANNED, PRESENT, READY, ONGOING, CANCELLED_BY_LOCK, INELIGIBLE
   * - Bỏ buổi đã hủy hoặc đã hoàn thành
   *
   * @param manager EntityManager dùng để query
   * @param horseIds UUID các ngựa cần xét, không rỗng
   * @param excludeClassId UUID lớp không xét
   * @returns Promise trả về các buổi giữ chỗ kèm UUID ngựa và mã lớp
   */
  async horseSessionHoldings(
    manager: EntityManager,
    horseIds: string[],
    excludeClassId: string,
  ): Promise<HorseSessionHolding[]> {
    const participants = await manager.find(SessionParticipantEntity, {
      where: {
        horseId: In(horseIds),
        status: In(SEAT_HOLDING_PARTICIPANT_STATUSES),
        session: {
          classId: Not(excludeClassId),
          status: Not(
            In([
              TrainingSessionStatus.CANCELLED,
              TrainingSessionStatus.COMPLETED,
            ]),
          ),
        },
      },
      relations: { session: { trainingClass: true } },
    });
    return participants.map(({ horseId, session }) => ({
      horseId,
      sessionId: session.id,
      classCode: session.trainingClass.code,
      intensity: session.intensity,
      scheduledStartAt: session.scheduledStartAt,
      scheduledEndAt: session.scheduledEndAt,
    }));
  }

  /**
   * Khóa chia sẻ row user (FOR SHARE) tới hết transaction rồi kiểm user còn hoạt động
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userId UUID của user
   * @returns Promise hoàn tất khi user còn hoạt động
   * @throws ForbiddenException Nếu không có user hoặc user không ở trạng thái hoạt động
   */
  async lockActiveUser(manager: EntityManager, userId: string): Promise<void> {
    const user = await manager.findOne(UserEntity, {
      where: { id: userId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản không hoạt động.');
    }
  }

  /**
   * Khóa nhiều buổi tập theo thứ tự UUID tới hết transaction, không kiểm gì
   *
   * - Bỏ id trùng; id không có buổi thì bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param sessionIds UUID các buổi cần khóa
   * @returns Promise hoàn tất khi đã khóa xong
   */
  async lockSessions(
    manager: EntityManager,
    sessionIds: string[],
  ): Promise<void> {
    const ids = [...new Set(sessionIds)].sort();
    if (ids.length === 0) return;
    await manager.find(TrainingSessionEntity, {
      select: { id: true },
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'for_no_key_update' },
    });
  }

  /**
   * Khóa nhiều lượt tham gia theo thứ tự UUID tới hết transaction, không kiểm gì
   *
   * - Bỏ id trùng; id không có lượt thì bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param participantIds UUID các lượt cần khóa
   * @returns Promise hoàn tất khi đã khóa xong
   */
  async lockParticipants(
    manager: EntityManager,
    participantIds: string[],
  ): Promise<void> {
    const ids = [...new Set(participantIds)].sort();
    if (ids.length === 0) return;
    await manager.find(SessionParticipantEntity, {
      select: { id: true },
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'for_no_key_update' },
    });
  }

  /**
   * Khóa chia sẻ (FOR SHARE) row lớp tới hết transaction, không kiểm gì; lớp không có thì bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param classId UUID của lớp
   * @returns Promise hoàn tất khi đã khóa
   */
  async lockTrainingClassShared(
    manager: EntityManager,
    classId: string,
  ): Promise<void> {
    await manager.find(TrainingClassEntity, {
      select: { id: true },
      where: { id: classId },
      lock: { mode: 'pessimistic_read' },
    });
  }

  /**
   * Khóa row user của nhiều người theo thứ tự UUID
   *
   * - Bỏ id trùng; id không có user thì bỏ qua
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userIds UUID các user cần khóa
   * @returns Promise hoàn tất khi đã khóa xong
   */
  async lockUsers(manager: EntityManager, userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)].sort();
    if (ids.length === 0) return;
    await manager.find(UserEntity, {
      select: { id: true },
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'for_no_key_update' },
    });
  }

  /**
   * Lấy các lượt tập Groom được giao dắt có buổi giao với một khoảng giờ, mọi trạng thái
   *
   * - Kèm tên ngựa (kể cả hồ sơ đã xóa mềm), tên, giờ và trạng thái buổi
   *
   * @param manager EntityManager dùng để query
   * @param groomId UUID của Groom
   * @param from Đầu khoảng giờ
   * @param to Cuối khoảng giờ
   * @returns Promise trả về các lượt Groom đang dắt trong khoảng giờ
   */
  async groomRunsBetween(
    manager: EntityManager,
    groomId: string,
    from: Date,
    to: Date,
  ): Promise<GroomRun[]> {
    const rows = await manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .innerJoinAndSelect('participant.session', 'session')
      .innerJoinAndSelect('participant.horse', 'horse')
      .withDeleted()
      .where('participant.assignedGroomId = :groomId', { groomId })
      .andWhere('session.scheduledStartAt < :to', { to })
      .andWhere('session.scheduledEndAt > :from', { from })
      .getMany();
    return rows.map(toGroomRun);
  }

  /**
   * Tìm các cặp lượt trùng giờ khi gắn người dắt cho nhiều lượt cùng lúc
   *
   * - Gom lượt theo Groom; mỗi Groom đọc lượt đang dắt trong khoảng giờ của các lượt sắp gắn (groomRunsBetween) rồi xét bằng findGroomRunClashes
   * - Không lock user của Groom
   *
   * @param manager EntityManager của transaction đang chạy
   * @param runs Các lượt sắp gắn, mỗi lượt kèm UUID Groom được gắn
   * @returns Promise trả về các cặp lượt sắp gắn và lượt đang dắt trùng giờ
   */
  async groomRunClashes(
    manager: EntityManager,
    runs: ReadonlyArray<{ groomId: string; run: GroomRun }>,
  ): Promise<Array<{ run: GroomRun; clash: GroomRun }>> {
    const byGroom = new Map<string, GroomRun[]>();
    for (const { groomId, run } of runs) {
      byGroom.set(groomId, [...(byGroom.get(groomId) ?? []), run]);
    }
    const clashes: Array<{ run: GroomRun; clash: GroomRun }> = [];
    for (const [groomId, own] of byGroom) {
      const busy = await this.groomRunsBetween(
        manager,
        groomId,
        new Date(Math.min(...own.map((run) => +run.scheduledStartAt))),
        new Date(Math.max(...own.map((run) => +run.scheduledEndAt))),
      );
      clashes.push(...findGroomRunClashes(own, busy));
    }
    return clashes;
  }

  /**
   * Lấy lịch tập của nhiều ngựa ở những lớp khác trong một câu truy vấn
   *
   * - Lịch của ngựa ở một lớp: buổi DRAFT, SCHEDULED, IN_PROGRESS bắt đầu sau thời điểm hiện tại và nằm trong một khoảng ghi danh chưa hủy [enrolledAt, leftAt) của ngựa ở lớp đó
   * - Tính cả ngựa đã xóa mềm
   *
   * @param manager EntityManager dùng để query
   * @param horseIds UUID các ngựa cần xét, không rỗng
   * @param excludeClassId UUID lớp không xét
   * @returns Promise trả về các buổi trong lịch kèm UUID ngựa và mã lớp
   */
  async horseScheduledSessionsInOtherClasses(
    manager: EntityManager,
    horseIds: string[],
    excludeClassId: string,
  ): Promise<HorseClassSession[]> {
    return manager
      .createQueryBuilder(TrainingSessionEntity, 'session')
      .innerJoin(TrainingClassEntity, 'class', 'class.id = session.class_id')
      .innerJoin(
        HorseEnrollmentEntity,
        'enrollment',
        'enrollment.class_id = session.class_id',
      )
      .select('enrollment.horse_id', 'horseId')
      .addSelect('session.id', 'sessionId')
      .addSelect('session.intensity', 'intensity')
      .addSelect('class.code', 'classCode')
      .addSelect('session.scheduled_start_at', 'scheduledStartAt')
      .addSelect('session.scheduled_end_at', 'scheduledEndAt')
      .where('enrollment.horse_id IN (:...horseIds)', { horseIds })
      .andWhere('enrollment.status <> :cancelledEnrollment', {
        cancelledEnrollment: HorseEnrollmentStatus.CANCELLED,
      })
      .andWhere('session.class_id <> :excludeClassId', { excludeClassId })
      .andWhere('session.status IN (:...sessionStatuses)', {
        sessionStatuses: HORSE_SCHEDULE_SESSION_STATUSES,
      })
      .andWhere('session.scheduled_start_at > :now', { now: new Date() })
      .andWhere('session.scheduled_start_at >= enrollment.enrolled_at')
      .andWhere(
        '(enrollment.left_at IS NULL OR session.scheduled_start_at < enrollment.left_at)',
      )
      .getRawMany<HorseClassSession>();
  }

  /**
   * Lấy các buổi chưa hủy ở những lớp do một hoặc nhiều Head Trainer phụ trách, có giờ giao với một khoảng giờ
   *
   * - Buổi giao khoảng giờ khi kết thúc sau `from` và (nếu có `to`) bắt đầu trước `to`; sát mép không tính
   * - Kèm UUID, mã lớp và Head Trainer của lớp; sắp theo giờ bắt đầu
   *
   * @param manager EntityManager dùng để query
   * @param headTrainerIds UUID các Head Trainer cần xét, không rỗng
   * @param from Đầu khoảng giờ
   * @param to Cuối khoảng giờ; bỏ trống là không giới hạn
   * @param excludeClassId UUID lớp không xét; bỏ trống là xét mọi lớp
   * @returns Promise trả về các buổi trong khoảng giờ, sớm nhất trước
   */
  async headTrainerSessions(
    manager: EntityManager,
    headTrainerIds: string[],
    from: Date,
    to?: Date,
    excludeClassId?: string,
  ): Promise<HeadTrainerSession[]> {
    const query = manager
      .createQueryBuilder(TrainingSessionEntity, 'session')
      .innerJoin(TrainingClassEntity, 'class', 'class.id = session.class_id')
      .select('session.id', 'sessionId')
      .addSelect('class.id', 'classId')
      .addSelect('class.code', 'classCode')
      .addSelect('class.head_trainer_id', 'headTrainerId')
      .addSelect('session.scheduled_start_at', 'scheduledStartAt')
      .addSelect('session.scheduled_end_at', 'scheduledEndAt')
      .where('class.head_trainer_id IN (:...headTrainerIds)', {
        headTrainerIds,
      })
      .andWhere('session.status <> :cancelled', {
        cancelled: TrainingSessionStatus.CANCELLED,
      })
      .andWhere('session.scheduled_end_at > :from', { from })
      .orderBy('session.scheduled_start_at', 'ASC');
    if (to) query.andWhere('session.scheduled_start_at < :to', { to });
    if (excludeClassId) {
      query.andWhere('class.id <> :excludeClassId', { excludeClassId });
    }
    return query.getRawMany<HeadTrainerSession>();
  }

  /**
   * Tìm lớp huấn luyện và tải kèm Head Trainer phụ trách
   *
   * @param manager EntityManager dùng để query
   * @param id UUID của lớp
   * @returns Lớp huấn luyện kèm Head Trainer
   * @throws NotFoundException Nếu không tìm thấy lớp
   */
  async findTrainingClass(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingClassEntity> {
    const row = await manager.findOne(TrainingClassEntity, {
      where: { id },
      relations: { headTrainer: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lớp huấn luyện');
    return row;
  }

  /**
   * Kiểm người gọi có quyền xem lớp huấn luyện hay không
   *
   * - Club Manager và Veterinarian xem được mọi lớp
   * - Head Trainer chỉ xem lớp mình phụ trách
   * - Horse Owner xem lớp có ngựa hiện thuộc sở hữu của mình ghi danh; không
   *   lọc trạng thái ghi danh
   * - Groom xem lớp có ít nhất một lượt được giao cho mình; không lọc trạng
   *   thái lượt tập hoặc buổi tập
   * - Trả false nếu không thuộc các trường hợp trên
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param callerId UUID của user hiện tại
   * @param trainingClass Lớp cần kiểm tra quyền
   * @param manager EntityManager dùng để query
   * @returns true nếu người gọi được xem lớp
   */
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
          .innerJoin(HorseEntity, 'horse', 'horse.id = enrollment.horse_id')
          .where('enrollment.class_id = :classId', {
            classId: trainingClass.id,
          })
          .andWhere('horse.owner_id = :callerId', { callerId })
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
          .where('session.class_id = :classId', {
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

  /**
   * Tìm lớp và yêu cầu người gọi có quyền xem lớp đó
   *
   * - Quyền xem được xác định theo canReadClass
   * - Lớp không tồn tại hoặc người gọi không có quyền đều trả 404
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param classId UUID của lớp
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Lớp huấn luyện người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu lớp không tồn tại hoặc ngoài phạm vi xem
   */
  async assertCanReadClass(
    actor: Actor,
    classId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingClassEntity> {
    const caller = await this.currentUser(actor, manager);
    const trainingClass = await this.findTrainingClass(manager, classId);
    if (!(await this.canReadClass(actor, caller.id, trainingClass, manager))) {
      throw new NotFoundException('Không tìm thấy lớp huấn luyện');
    }
    return trainingClass;
  }

  /**
   * Tìm và khóa một lớp để các thao tác ghi trên lớp chạy tuần tự
   *
   * @param manager EntityManager của transaction đang chạy
   * @param id UUID của lớp cần khóa
   * @returns Lớp huấn luyện đã khóa
   * @throws NotFoundException Nếu không tìm thấy lớp
   */
  async lockedTrainingClass(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingClassEntity> {
    const row = await manager.findOne(TrainingClassEntity, {
      where: { id },
      lock: { mode: 'for_no_key_update' },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lớp huấn luyện');
    return row;
  }

  /**
   * Tìm buổi tập và tải kèm lớp chứa buổi đó
   *
   * @param manager EntityManager dùng để query
   * @param sessionId UUID của buổi tập
   * @returns Buổi tập kèm lớp huấn luyện
   * @throws NotFoundException Nếu không tìm thấy buổi tập
   */
  async findSession(
    manager: EntityManager,
    sessionId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      relations: { trainingClass: true },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    return session;
  }

  /**
   * Tìm và khóa một buổi tập để các thao tác ghi trên buổi chạy tuần tự
   *
   * @param manager EntityManager của transaction đang chạy
   * @param sessionId UUID của buổi tập cần khóa
   * @returns Buổi tập đã khóa
   * @throws NotFoundException Nếu không tìm thấy buổi tập
   */
  async lockedSession(
    manager: EntityManager,
    sessionId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    return session;
  }

  /**
   * Tìm buổi tập và kiểm tra người gọi có quyền xem lớp chứa buổi đó
   *
   * - Phạm vi quyền xem được kiểm tra theo canReadClass
   * - Buổi không tồn tại hoặc người gọi không có quyền đều trả 404
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param sessionId UUID của buổi tập
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Buổi tập người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu buổi không tồn tại hoặc ngoài phạm vi xem
   */
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
        session.trainingClass,
        manager,
      ))
    ) {
      throw new NotFoundException('Không tìm thấy buổi tập');
    }
    return session;
  }

  /**
   * Tìm lượt tập và tải kèm buổi, lớp, ngựa và ghi danh liên quan
   *
   * @param manager EntityManager dùng để query
   * @param participantId UUID của lượt tập
   * @returns Lượt tập cùng các quan hệ cần cho kiểm tra quyền và nghiệp vụ
   * @throws NotFoundException Nếu không tìm thấy lượt tập
   */
  async findParticipant(
    manager: EntityManager,
    participantId: string,
  ): Promise<SessionParticipantEntity> {
    const participant = await manager.findOne(SessionParticipantEntity, {
      where: { id: participantId },
      relations: {
        session: { trainingClass: true },
        horse: true,
        horseEnrollment: true,
      },
    });
    if (!participant) throw new NotFoundException('Không tìm thấy lượt tập');
    return participant;
  }

  /**
   * Tìm và khóa một lượt tập để các thao tác ghi trên lượt chạy tuần tự
   *
   * @param manager EntityManager của transaction đang chạy
   * @param participantId UUID của lượt tập cần khóa
   * @returns Lượt tập đã khóa
   * @throws NotFoundException Nếu không tìm thấy lượt tập
   */
  async lockedParticipant(
    manager: EntityManager,
    participantId: string,
  ): Promise<SessionParticipantEntity> {
    const participant = await manager.findOne(SessionParticipantEntity, {
      where: { id: participantId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!participant) throw new NotFoundException('Không tìm thấy lượt tập');
    return participant;
  }

  /**
   * Tìm ghi danh và tải kèm lớp cùng hồ sơ ngựa
   *
   * @param manager EntityManager dùng để query
   * @param enrollmentId UUID của ghi danh
   * @returns Ghi danh kèm lớp và ngựa
   * @throws NotFoundException Nếu không tìm thấy ghi danh
   */
  async findEnrollment(
    manager: EntityManager,
    enrollmentId: string,
  ): Promise<HorseEnrollmentEntity> {
    const row = await manager.findOne(HorseEnrollmentEntity, {
      where: { id: enrollmentId },
      relations: { trainingClass: true, horse: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy ghi danh của ngựa');
    return row;
  }

  /**
   * Kiểm người gọi có quyền xem một ghi danh hay không
   *
   * - Club Manager và Veterinarian xem được mọi ghi danh
   * - Head Trainer cần phụ trách lớp và ngựa đang thuộc khu mình
   * - Horse Owner cần hiện là chủ sở hữu của ngựa
   * - Groom cần được giao ít nhất một lượt tập thuộc ghi danh này; không lọc
   *   trạng thái lượt tập
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param callerId UUID của user hiện tại
   * @param enrollment Ghi danh cần kiểm tra quyền
   * @param manager EntityManager dùng để query
   * @returns true nếu người gọi được xem ghi danh
   */
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
        (await this.horseAccess.isHorseInTrainerBarn(
          manager,
          enrollment.horseId,
          callerId,
        ))
      ) {
        return true;
      }
    }
    if (actor.roles.includes(UserRole.HORSE_OWNER)) {
      return manager.existsBy(HorseEntity, {
        id: enrollment.horseId,
        ownerId: callerId,
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

  /**
   * Tìm lượt tập và kiểm tra người gọi có quyền xem lượt đó
   *
   * - Nếu không có quyền, trả 404 để không tiết lộ lượt tập tồn tại
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param participantId UUID của lượt tập
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Lượt tập người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu lượt không tồn tại hoặc ngoài phạm vi xem
   */
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
      throw new NotFoundException('Không tìm thấy lượt tập');
    }
    return participant;
  }

  /**
   * Kiểm người gọi có được xem một lượt tập không
   *
   * - Club Manager, Veterinarian: xem mọi lượt
   * - Groom: lượt được giao cho mình
   * - Head Trainer: mọi lượt, không xét lớp hay khu
   * - Horse Owner: lượt của ngựa mình đang là chủ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param participant Lượt tập đã tải kèm buổi và lớp
   * @param manager EntityManager dùng để query
   * @returns Promise trả về true nếu được xem
   */
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
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) return true;
    if (actor.roles.includes(UserRole.HORSE_OWNER)) {
      return manager.existsBy(HorseEntity, {
        id: participant.horseId,
        ownerId: callerId,
      });
    }
    return false;
  }

  /**
   * Tìm buổi tập và yêu cầu người gọi có quyền xem lớp chứa buổi đó
   *
   * - Dùng cùng quy tắc quyền với sessionForActor
   * - Buổi không tồn tại hoặc người gọi không có quyền đều trả 404
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param sessionId UUID của buổi tập
   * @param manager EntityManager dùng để query, mặc định là manager của DataSource
   * @returns Buổi tập người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu buổi không tồn tại hoặc ngoài phạm vi xem
   */
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
        session.trainingClass,
        manager,
      ))
    ) {
      throw new NotFoundException('Không tìm thấy buổi tập');
    }
    return session;
  }

  /**
   * Kiểm UUID được gán là Groom đang hoạt động
   *
   * @param manager EntityManager dùng để query
   * @param groomId UUID của user cần kiểm tra
   * @returns User có vai trò Groom và đang hoạt động
   * @throws BadRequestException Nếu user không tồn tại, không hoạt động hoặc sai vai trò
   */
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

  /**
   * Kiểm UUID được gán là Head Trainer đang hoạt động
   *
   * @param manager EntityManager dùng để query
   * @param headTrainerId UUID của user cần kiểm tra
   * @returns User có vai trò Head Trainer và đang hoạt động
   * @throws BadRequestException Nếu user không tồn tại, không hoạt động hoặc sai vai trò
   */
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
    if (!trainer)
      throw new BadRequestException('Huấn luyện viên trưởng không hợp lệ');
    return trainer;
  }

  /**
   * Chặn Head Trainer thao tác trên ngựa ngoài khu mình phụ trách, theo HorseAccessService.assertTrainerBarn
   *
   * - Người có cả vai trò Club Manager thì không bị giới hạn theo khu
   *
   * @param manager EntityManager dùng để query
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ForbiddenException Nếu người gọi là Head Trainer và ngựa không thuộc khu mình phụ trách
   */
  async assertTrainerBarn(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<void> {
    await this.horseAccess.assertTrainerBarn(manager, actor, callerId, horseId);
  }

  /**
   * Kiểm Head Trainer hiện tại có quyền quản lý lớp hay không
   *
   * - Người gọi phải có vai trò Head Trainer
   * - Lớp phải được phân công Head Trainer
   * - Head Trainer được phân công phải trùng với người gọi
   *
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param callerId UUID của user hiện tại
   * @param headTrainerId UUID Head Trainer đang phụ trách lớp, hoặc null
   * @throws ForbiddenException Nếu bất kỳ điều kiện quyền nào không đạt
   */
  assertCanManageClass(
    actor: Actor,
    callerId: string,
    headTrainerId: string | null,
  ): void {
    if (!actor.roles.includes(UserRole.HEAD_TRAINER)) {
      throw new ForbiddenException('Không có quyền quản lý lớp huấn luyện');
    }
    if (!headTrainerId) {
      throw new ForbiddenException(
        'Lớp phải được phân công cho Huấn luyện viên trưởng trước khi thao tác',
      );
    }
    if (headTrainerId !== callerId) {
      throw new ForbiddenException('Lớp thuộc Huấn luyện viên trưởng khác');
    }
  }

  /**
   * Kiểm người gọi có được thao tác trên một lượt tập hay không
   *
   * - Groom chỉ thao tác lượt được giao cho mình
   * - Head Trainer phải phụ trách lớp của lượt và ngựa phải thuộc khu mình
   * - Các vai trò khác không được thao tác
   *
   * @param manager EntityManager dùng để kiểm tra khu của ngựa
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param callerId UUID của user hiện tại
   * @param participant Lượt tập đã tải kèm buổi và lớp
   * @throws ForbiddenException Nếu người gọi không được thao tác trên lượt
   */
  async assertCanOperateParticipant(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    participant: SessionParticipantEntity,
  ): Promise<void> {
    if (actor.roles.includes(UserRole.GROOM)) {
      if (participant.assignedGroomId !== callerId) {
        throw new ForbiddenException('Lượt tập này không được giao cho bạn');
      }
      return;
    }
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      if (participant.session.trainingClass.headTrainerId !== callerId) {
        throw new ForbiddenException(
          'Lượt tập thuộc lớp của Huấn luyện viên trưởng khác',
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
    throw new ForbiddenException('Bạn không được thao tác trên lượt tập này');
  }

  /**
   * Chặn ghi kết quả (đánh giá, kết quả chạy thử) trên một lượt tập
   *
   * - Lượt đã tập xong (COMPLETED, STOPPED): theo assertCanEditFinishedRun, không kiểm khu hiện tại của ngựa
   * - Lượt khác: theo assertCanOperateParticipant
   *
   * @param manager EntityManager dùng để query
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param participant Lượt tập đã tải kèm buổi, lớp và ngựa (findParticipant)
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ForbiddenException Nếu người gọi không được thao tác lượt tập này
   * @throws NotFoundException Nếu lượt đã tập xong mà hồ sơ ngựa đã xóa
   * @throws ConflictException Nếu lượt đã tập xong mà ngựa đã chuyển nhượng hoặc đã mất
   */
  async assertCanRecordRunResult(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    participant: SessionParticipantEntity,
  ): Promise<void> {
    if (TRAINED_PARTICIPANT_STATUSES.includes(participant.status)) {
      this.assertCanEditFinishedRun(actor, callerId, participant);
      return;
    }
    await this.assertCanOperateParticipant(
      manager,
      actor,
      callerId,
      participant,
    );
  }

  /**
   * Kiểm quyền thao tác buổi tập theo vai trò và các lượt trong buổi
   *
   * - Club Manager được phép ngay
   * - Groom cần được giao ít nhất một lượt trong buổi
   * - Head Trainer cần quản lý được khu của mọi ngựa có lượt trong buổi; hàm
   *   này không tự kiểm tra Head Trainer có phụ trách lớp hay không
   * - Vai trò khác không được thao tác
   *
   * @param manager EntityManager dùng để query lượt tập và khu của ngựa
   * @param actor Thông tin danh tính và các vai trò từ Access Token
   * @param callerId UUID của user hiện tại
   * @param session Buổi tập cần kiểm tra
   * @throws ForbiddenException Nếu người gọi không có quyền thao tác buổi
   */
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
        throw new ForbiddenException(
          'Bạn không được giao lượt tập nào trong buổi này',
        );
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

  /**
   * Liệt kê mã các lớp đang chạy của một Head Trainer có ngựa của một khu đang học
   *
   * - Chỉ tính lớp ACTIVE do Head Trainer đó phụ trách; lớp nháp, hoàn thành, hủy không tính
   * - Chỉ tính ghi danh ACTIVE của ngựa chưa xóa mềm đang thuộc khu (horses.barn_id); ghi danh LEFT, CANCELLED không tính
   * - Mỗi lớp xuất hiện một lần, sắp theo mã
   *
   * @param manager EntityManager dùng để query
   * @param headTrainerId UUID Head Trainer phụ trách lớp
   * @param barnId UUID của khu chuồng
   * @returns Promise trả về danh sách mã lớp, rỗng nếu không có
   */
  async findActiveClassCodesWithHorsesInBarn(
    manager: EntityManager,
    headTrainerId: string,
    barnId: string,
  ): Promise<string[]> {
    const rows = await manager
      .createQueryBuilder(TrainingClassEntity, 'class')
      .select('class.code', 'code')
      .distinct(true)
      .innerJoin(
        HorseEnrollmentEntity,
        'enrollment',
        'enrollment.class_id = class.id',
      )
      .innerJoin(HorseEntity, 'horse', 'horse.id = enrollment.horse_id')
      .where('class.head_trainer_id = :headTrainerId', { headTrainerId })
      .andWhere('class.status = :classStatus', {
        classStatus: TrainingClassStatus.ACTIVE,
      })
      .andWhere('enrollment.status = :enrollmentStatus', {
        enrollmentStatus: HorseEnrollmentStatus.ACTIVE,
      })
      .andWhere('horse.barn_id = :barnId', { barnId })
      .orderBy('class.code', 'ASC')
      .getRawMany<{ code: string }>();
    return rows.map((row) => row.code);
  }

  /**
   * Chặn sửa dữ liệu của lượt đã tập xong
   *
   * - Chỉ Head Trainer phụ trách lớp của lượt; ngựa đã sang khu khác vẫn được
   * - Hồ sơ ngựa đã xóa: 404
   * - Ngựa đã chuyển nhượng hoặc đã mất: 409, hồ sơ chỉ được xem
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param participant Lượt tập đã tải kèm buổi, lớp và ngựa (findParticipant)
   * @throws ForbiddenException Nếu người gọi không phải Head Trainer phụ trách lớp của lượt
   * @throws NotFoundException Nếu hồ sơ ngựa đã xóa
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất
   */
  private assertCanEditFinishedRun(
    actor: Actor,
    callerId: string,
    participant: SessionParticipantEntity,
  ): void {
    if (
      !actor.roles.includes(UserRole.HEAD_TRAINER) ||
      participant.session.trainingClass.headTrainerId !== callerId
    ) {
      throw new ForbiddenException(
        'Lượt tập thuộc lớp của Huấn luyện viên trưởng khác',
      );
    }
    if (!participant.horse || participant.horse.deletedAt) {
      throw new NotFoundException(HORSE_NOT_FOUND_MESSAGE);
    }
    assertLifecycleWritable(participant.horse);
  }
}
