import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { BarnsService } from '../../stable/barns/barns.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import {
  HeadTrainerHandoverDto,
  HeadTrainerHandoverResultDto,
} from '../dto/head-trainer-handover.dto';
import { UserEntity } from '../entities/user.entity';
import { currentUserForActor } from '../utils/current-user';

/**
 * Bàn giao toàn bộ việc của một Head Trainer (khu chuồng, giáo án, lớp chưa kết thúc) sang Head Trainer khác
 */
@Injectable()
export class HeadTrainerHandoverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly barns: BarnsService,
    private readonly training: TrainingOperationsFacade,
  ) {}

  /**
   * Chuyển mọi khu chuồng, mọi giáo án và các lớp nháp/đang chạy của một Head Trainer sang Head Trainer khác trong một transaction
   *
   * - Lớp đã hoàn thành hoặc đã hủy giữ Head Trainer cũ
   * - Mỗi khu chuồng được chuyển ghi một dòng nhật ký
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param fromHeadTrainerId UUID của Head Trainer bàn giao
   * @param body Head Trainer nhận bàn giao
   * @returns Promise trả về số khu, số giáo án và số lớp đã chuyển
   * @throws ForbiddenException Nếu tài khoản người gọi không hoạt động
   * @throws NotFoundException Nếu người bàn giao không phải Head Trainer
   * @throws BadRequestException Nếu người nhận trùng người bàn giao, không có hoặc không phải Head Trainer
   * @throws ConflictException Nếu người nhận không ở trạng thái hoạt động
   */
  async handover(
    actor: Actor,
    fromHeadTrainerId: string,
    body: HeadTrainerHandoverDto,
  ): Promise<HeadTrainerHandoverResultDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    if (fromHeadTrainerId === body.toHeadTrainerId) {
      throw new BadRequestException(
        'Huấn luyện viên trưởng nhận phải khác người bàn giao',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const from = await this.lockedUser(manager, fromHeadTrainerId);
      if (!from || from.role !== UserRole.HEAD_TRAINER) {
        throw new NotFoundException('Không tìm thấy Huấn luyện viên trưởng');
      }
      const to = await this.lockedUser(manager, body.toHeadTrainerId);
      if (!to || to.role !== UserRole.HEAD_TRAINER) {
        throw new BadRequestException(
          'Huấn luyện viên trưởng nhận không hợp lệ',
        );
      }
      if (to.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          'Huấn luyện viên trưởng nhận không ở trạng thái hoạt động',
        );
      }
      const barnsMoved = await this.barns.reassignHeadTrainerBarns(
        manager,
        caller.id,
        from.id,
        to.id,
      );
      const work = await this.training.handOverHeadTrainerWork(
        manager,
        from.id,
        to.id,
      );
      return { barnsMoved, ...work };
    });
  }

  /**
   * Khóa row tài khoản để bàn giao không chạy song song với khóa tài khoản hay đổi vai trò
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userId UUID của tài khoản
   * @returns Promise trả về tài khoản đã khóa, hoặc null nếu không có
   */
  private lockedUser(
    manager: EntityManager,
    userId: string,
  ): Promise<UserEntity | null> {
    return manager.findOne(UserEntity, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
