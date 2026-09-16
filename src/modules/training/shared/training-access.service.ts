import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
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
   * Trích xuất trực tiếp mã ID của CLB (clubId) mà người dùng hiện tại thuộc về.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns string - UUID của câu lạc bộ mà người dùng đang làm việc
   * @throws ForbiddenException Nếu tài khoản chưa thuộc CLB nào
   */
  async clubId(actor: Actor): Promise<string> {
    return (await this.currentUser(actor)).clubId;
  }

  /**
   * Xác thực quyền thao tác với ngựa của Actor:
   * - Kiểm tra user tồn tại và đang ACTIVE
   * - Kiểm tra user thuộc CLB
   * - Kiểm tra ngựa thuộc CLB của user
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param manager EntityManager tùy chọn (mặc định dataSource.manager)
   * @returns UserEntity người gọi
   * @throws ForbiddenException Nếu tài khoản chưa thuộc CLB nào
   * @throws NotFoundException Nếu không tìm thấy ngựa trong CLB
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
    if (!caller.clubId) {
      throw new ForbiddenException('Tài khoản chưa thuộc CLB nào.');
    }
    const horse = await this.horseInClub(manager, horseId, caller.clubId);
    return {
      user: caller,
      horse: horse,
    };
  }

  /**
   * Lấy thông tin kế hoạch huấn luyện của Actor:
   * - Xác thực user và lấy clubId
   * - Kiểm tra giáo án thuộc về CLB của user
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
    const clubId = await this.clubId(actor);
    return this.planInClub(manager, planId, clubId);
  }

  /**
   * Lấy thông tin buổi tập của Actor:
   * - Xác thực user và lấy clubId
   * - Kiểm tra buổi tập thuộc về CLB của user
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
    const clubId = await this.clubId(actor);
    return this.sessionInClub(manager, sessionId, clubId);
  }

  /**
   * Tìm kiếm ngựa theo ID và kiểm tra quyền sở hữu (ngựa phải thuộc về CLB tương ứng).
   * Thao tác đọc bình thường (Read-only), không áp dụng khóa dữ liệu.
   *
   * @param manager EntityManager quản lý query hiện tại
   * @param id UUID của ngựa
   * @param clubId UUID của câu lạc bộ cần kiểm tra
   * @returns HorseEntity - Thực thể ngựa tìm thấy trong CLB
   * @throws NotFoundException Nếu không tìm thấy ngựa hoặc ngựa thuộc CLB khác
   */
  async horseInClub(
    manager: EntityManager,
    horseId: string,
    clubId: string,
  ): Promise<HorseEntity> {
    const horse = await manager.findOneBy(HorseEntity, {
      id: horseId,
      clubId: clubId,
    });
    if (!horse) throw new NotFoundException('Ngựa không tồn tại.');
    return horse;
  }

  /**
   * Khóa bi quan (Pessimistic Write Lock - SELECT ... FOR UPDATE) ngựa trong CLB.
   * Sử dụng bên trong transaction khi cần cập nhật dữ liệu liên quan đến ngựa để tránh Race Condition.
   *
   * @param manager EntityManager đang nằm trong transaction
   * @param id UUID của con ngựa
   * @param clubId UUID của câu lạc bộ
   * @returns HorseEntity - Thực thể con ngựa đang bị khóa cho transaction hiện tại
   * @throws NotFoundException Nếu không tìm thấy ngựa trong CLB
   */
  async lockedHorseInClub(
    manager: EntityManager,
    horseId: string,
    clubId: string,
  ): Promise<HorseEntity> {
    const horse = await manager.findOne(HorseEntity, {
      where: { id: horseId, clubId: clubId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!horse) throw new NotFoundException('Không tìm thấy ngựa trong CLB');
    return horse;
  }

  /**
   * Lấy thông tin kế hoạch huấn luyện (TrainingPlan) kèm quan hệ với ngựa,
   * đồng thời xác thực xem con ngựa đó có thuộc về CLB của người gọi hay không.
   *
   * @param manager EntityManager quản lý query
   * @param id UUID của giáo án huấn luyện
   * @param clubId UUID của CLB cần kiểm tra
   * @returns TrainingPlanEntity - Thực thể giáo án kèm thông tin con ngựa
   * @throws NotFoundException Nếu không tìm thấy giáo án hoặc giáo án thuộc CLB khác
   */
  async planInClub(
    manager: EntityManager,
    id: string,
    clubId: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id },
      relations: { horse: true },
    });
    if (!plan || plan.horse.clubId !== clubId) {
      throw new NotFoundException('Không tìm thấy giáo án');
    }
    return plan;
  }

  /**
   * Khóa bi quan (Pessimistic Write Lock) kế hoạch huấn luyện trong transaction,
   * và kiểm tra con ngựa tương ứng có thuộc về CLB hay không.
   * Dùng trước khi kích hoạt (activate), hoàn thành (complete) hoặc hủy (cancel) giáo án.
   *
   * @param manager EntityManager đang nằm trong transaction
   * @param id UUID của giáo án huấn luyện
   * @param clubId UUID của CLB
   * @returns TrainingPlanEntity - Thực thể giáo án đang bị khóa trong transaction
   * @throws NotFoundException Nếu không tìm thấy giáo án hoặc ngựa không thuộc CLB
   */
  async lockedPlanInClub(
    manager: EntityManager,
    id: string,
    clubId: string,
  ): Promise<TrainingPlanEntity> {
    const plan = await manager.findOne(TrainingPlanEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy plan');
    await this.horseInClub(manager, plan.horseId, clubId);
    return plan;
  }

  /**
   * Lấy thông tin buổi tập (TrainingSession) qua quan hệ lồng nhau plan -> horse,
   * và xác thực con ngựa thuộc về CLB của người gọi.
   *
   * @param manager EntityManager quản lý query
   * @param id UUID của buổi tập
   * @param clubId UUID của CLB
   * @returns TrainingSessionEntity - Thực thể buổi tập kèm plan và horse
   * @throws NotFoundException Nếu không tìm thấy buổi tập hoặc buổi tập thuộc CLB khác
   */
  async sessionInClub(
    manager: EntityManager,
    sessionId: string,
    clubId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      relations: { plan: { horse: true } },
    });
    if (!session || session.plan.horse.clubId !== clubId) {
      throw new NotFoundException('Không tìm thấy buổi tập');
    }
    return session;
  }

  /**
   * Khóa bi quan (Pessimistic Write Lock) buổi tập trong transaction,
   * đồng thời xác thực gián tiếp quyền sở hữu qua giáo án và con ngựa trong CLB.
   * Dùng khi bắt đầu (start), hoàn thành (complete), đánh giá hoặc hủy buổi tập.
   *
   * @param manager EntityManager đang nằm trong transaction
   * @param id UUID của buổi tập
   * @param clubId UUID của CLB
   * @returns TrainingSessionEntity - Thực thể buổi tập đang bị khóa trong transaction
   * @throws NotFoundException Nếu không tìm thấy buổi tập hoặc giáo án/ngựa không thuộc CLB
   */
  async lockedSessionInClub(
    manager: EntityManager,
    id: string,
    clubId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    const plan = await manager.findOneByOrFail(TrainingPlanEntity, {
      id: session.planId,
    });
    await this.horseInClub(manager, plan.horseId, clubId);
    return session;
  }

  /**
   * Xác thực xem nhân sự phụ trách (groomId) có tồn tại trong CLB và có đúng vai trò GROOM hay không.
   * Dùng khi phân công người chăm sóc/huấn luyện cho buổi tập.
   *
   * @param manager EntityManager quản lý query
   * @param groomId UUID của người phụ trách cần kiểm tra
   * @param clubId UUID của CLB
   * @returns void
   * @throws BadRequestException Nếu người dùng không tồn tại hoặc không phải là GROOM của CLB
   */
  async assertGroom(
    manager: EntityManager,
    groomId: string,
    clubId: string,
  ): Promise<void> {
    const user = await manager.findOneBy(UserEntity, {
      id: groomId,
      clubId,
      role: UserRole.GROOM,
    });
    if (!user) throw new BadRequestException('Groom không hợp lệ trong CLB');
  }

  /**
   * Kiểm tra quyền thực hiện thao tác trên buổi tập (Start / Complete / Cancel):
   * - HEAD_TRAINER và CLUB_MANAGER: có toàn quyền thao tác trên mọi buổi tập trong CLB.
   * - GROOM: chỉ được thao tác nếu chính họ là người được phân công phụ trách buổi tập này (groomId).
   *
   * @param actor Danh tính và danh sách roles của người gọi từ token
   * @param callerId UUID của người dùng hiện tại
   * @param session Thực thể buổi tập đang được thao tác
   * @returns void
   * @throws ForbiddenException Nếu người gọi là Groom nhưng không được phân công buổi tập này
   */
  assertCanOperateSession(
    actor: Actor,
    callerId: string,
    session: TrainingSessionEntity,
  ): void {
    if (
      actor.roles.includes(UserRole.HEAD_TRAINER) ||
      actor.roles.includes(UserRole.CLUB_MANAGER)
    ) {
      return;
    }
    if (!actor.roles.includes(UserRole.GROOM) || session.groomId !== callerId) {
      throw new ForbiddenException(
        'Bạn không được giao thực hiện buổi tập này',
      );
    }
  }
}
