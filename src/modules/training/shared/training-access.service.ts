import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { assertTrainerBarn } from '../../stable/utils/trainer-barn';
import { UserEntity } from '../../users/entities/user.entity';
import { UserRole, UserStatus } from '../../users/user.enums';
import {
  type CurrentActorUser,
  currentUserForActor,
} from '../../users/utils/current-user';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';

@Injectable()
export class TrainingAccessService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Xác thực người gọi và lấy con ngựa mà người gọi được xem dữ liệu huấn luyện, cùng phạm vi với hồ sơ ngựa:
   * - Kiểm tra user tồn tại và đang ACTIVE
   * - Kiểm tra ngựa tồn tại và nằm trong phạm vi của người gọi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns Người gọi và ngựa
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async readableHorseForActor(
    actor: Actor,
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ user: UserEntity; horse: HorseEntity }> {
    const caller = await this.currentUser(actor);
    const horse = await findReadableHorse(manager, actor, caller.id, horseId);
    return { user: caller, horse };
  }

  /**
   * Kiểm tra người gọi có được xem mục tiêu (goal) của giáo án không. Groom chỉ xem tên giai đoạn.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns true nếu người gọi có role khác Groom được đọc giáo án
   */
  seesPlanGoal(actor: Actor): boolean {
    return [
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
      UserRole.HORSE_OWNER,
    ].some((role) => actor.roles.includes(role));
  }

  /**
   * Lấy thông tin User hiện tại từ token Actor.
   *
   * @param actor Thông tin danh tính lấy từ Access Token của request
   * @returns UserEntity - Thực thể người dùng hiện tại
   * @throws ForbiddenException Nếu tài khoản không hoạt động.
   */
  async currentUser(actor: Actor): Promise<CurrentActorUser> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    if (!caller || caller.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản không hoạt động.');
    }
    return caller;
  }

  /**
   * Xác thực quyền thao tác với ngựa của Actor:
   * - Kiểm tra user tồn tại và đang ACTIVE
   * - Kiểm tra ngựa tồn tại
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns Người gọi và ngựa
   * @throws NotFoundException Nếu không tìm thấy ngựa
   */
  async horseForActor(
    actor: Actor,
    horseId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{
    user: UserEntity;
    horse: HorseEntity;
  }> {
    const caller = await this.currentUser(actor);
    const horse = await this.findHorse(manager, horseId);
    return {
      user: caller,
      horse: horse,
    };
  }

  /**
   * Lấy thông tin kế hoạch huấn luyện sau khi xác thực người gọi đang ACTIVE.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của giáo án
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns TrainingPlanEntity
   */
  async planForActor(
    actor: Actor,
    planId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingPlanEntity> {
    await this.currentUser(actor);
    return this.findPlan(manager, planId);
  }

  /**
   * Lấy thông tin buổi tập sau khi xác thực người gọi đang ACTIVE.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns TrainingSessionEntity
   */
  async sessionForActor(
    actor: Actor,
    sessionId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TrainingSessionEntity> {
    await this.currentUser(actor);
    return this.findSession(manager, sessionId);
  }

  /**
   * Tìm kiếm ngựa theo ID. Thao tác đọc bình thường, không áp dụng khóa dữ liệu.
   *
   * @param manager EntityManager quản lý query hiện tại
   * @param horseId UUID của ngựa
   * @returns HorseEntity - Thực thể ngựa tìm thấy
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
   * Khóa bi quan (Pessimistic Write Lock - SELECT ... FOR UPDATE) ngựa.
   * Sử dụng bên trong transaction khi cần cập nhật dữ liệu liên quan đến ngựa để tránh Race Condition.
   *
   * @param manager EntityManager đang nằm trong transaction
   * @param horseId UUID của con ngựa
   * @returns HorseEntity - Thực thể con ngựa đang bị khóa cho transaction hiện tại
   * @throws NotFoundException Nếu không tìm thấy ngựa
   */
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

  /**
   * Lấy thông tin kế hoạch huấn luyện (TrainingPlan) kèm quan hệ với ngựa.
   *
   * @param manager EntityManager quản lý query
   * @param id UUID của giáo án huấn luyện
   * @returns TrainingPlanEntity - Thực thể giáo án kèm thông tin con ngựa
   * @throws NotFoundException Nếu không tìm thấy giáo án
   */
  async findPlan(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id },
      relations: { horse: true },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy giáo án');
    return plan;
  }

  /**
   * Khóa bi quan (Pessimistic Write Lock) kế hoạch huấn luyện trong transaction.
   * Dùng trước khi sửa, kích hoạt (activate), hoàn thành (complete) hoặc hủy (cancel) giáo án.
   *
   * @param manager EntityManager đang nằm trong transaction
   * @param id UUID của giáo án huấn luyện
   * @returns TrainingPlanEntity - Thực thể giáo án đang bị khóa trong transaction
   * @throws NotFoundException Nếu không tìm thấy giáo án
   */
  async lockedPlan(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy plan');
    return plan;
  }

  /**
   * Lấy thông tin buổi tập (TrainingSession) qua quan hệ lồng nhau plan -> horse.
   *
   * @param manager EntityManager quản lý query
   * @param sessionId UUID của buổi tập
   * @returns TrainingSessionEntity - Thực thể buổi tập kèm plan và horse
   * @throws NotFoundException Nếu không tìm thấy buổi tập
   */
  async findSession(
    manager: EntityManager,
    sessionId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      relations: { plan: { horse: true } },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    return session;
  }

  /**
   * Khóa bi quan (Pessimistic Write Lock) buổi tập trong transaction.
   * Dùng khi bắt đầu (start), hoàn thành (complete), đánh giá hoặc hủy buổi tập.
   *
   * @param manager EntityManager đang nằm trong transaction
   * @param id UUID của buổi tập
   * @returns TrainingSessionEntity - Thực thể buổi tập đang bị khóa trong transaction
   * @throws NotFoundException Nếu không tìm thấy buổi tập
   */
  async lockedSession(
    manager: EntityManager,
    id: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    return session;
  }

  /**
   * Xác thực xem nhân sự phụ trách (groomId) có tồn tại và có đúng vai trò GROOM hay không.
   * Dùng khi phân công người chăm sóc/huấn luyện cho buổi tập.
   *
   * @param manager EntityManager quản lý query
   * @param groomId UUID của người phụ trách cần kiểm tra
   * @returns void
   * @throws BadRequestException Nếu người dùng không tồn tại hoặc không phải là GROOM
   */
  async assertGroom(manager: EntityManager, groomId: string): Promise<void> {
    const user = await manager.findOneBy(UserEntity, {
      id: groomId,
      role: UserRole.GROOM,
    });
    if (!user) throw new BadRequestException('Groom không hợp lệ');
  }

  /**
   * Kiểm tra Head Trainer chỉ ra quyết định hoặc xem thông tin nhạy cảm của ngựa thuộc khu mình phụ trách.
   * Các role khác (CLUB_MANAGER, GROOM, ...) không bị chặn bởi hàm này.
   *
   * @param manager EntityManager quản lý query
   * @param actor Danh tính và danh sách roles của người gọi từ token
   * @param callerId UUID của người dùng hiện tại
   * @param horseId UUID của ngựa
   * @returns void
   * @throws ForbiddenException Nếu người gọi là Head Trainer và ngựa không thuộc khu của họ
   */
  async assertTrainerBarn(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    horseId: string,
  ): Promise<void> {
    await assertTrainerBarn(manager, actor, callerId, horseId);
  }

  /**
   * Kiểm tra quyền thực hiện thao tác trên buổi tập (Start / Complete / Cancel / Time trial):
   * - CLUB_MANAGER: có toàn quyền thao tác trên mọi buổi tập trong CLB.
   * - HEAD_TRAINER: chỉ thao tác trên buổi tập của ngựa thuộc khu mình phụ trách.
   * - GROOM: chỉ được thao tác nếu chính họ là người được phân công phụ trách buổi tập này (groomId).
   *
   * @param manager EntityManager quản lý query
   * @param actor Danh tính và danh sách roles của người gọi từ token
   * @param callerId UUID của người dùng hiện tại
   * @param session Thực thể buổi tập đang được thao tác
   * @returns void
   * @throws ForbiddenException Nếu Head Trainer không phụ trách khu của ngựa, hoặc Groom không được giao buổi tập này
   */
  async assertCanOperateSession(
    manager: EntityManager,
    actor: Actor,
    callerId: string,
    session: TrainingSessionEntity,
  ): Promise<void> {
    if (actor.roles.includes(UserRole.CLUB_MANAGER)) return;
    if (actor.roles.includes(UserRole.HEAD_TRAINER)) {
      const plan = await manager.findOneByOrFail(TrainingPlanEntity, {
        id: session.planId,
      });
      await assertTrainerBarn(manager, actor, callerId, plan.horseId);
      return;
    }
    if (!actor.roles.includes(UserRole.GROOM) || session.groomId !== callerId) {
      throw new ForbiddenException(
        'Bạn không được giao thực hiện buổi tập này',
      );
    }
  }
}
