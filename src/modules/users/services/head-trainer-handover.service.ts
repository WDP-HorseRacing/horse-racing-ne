import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
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
    private readonly auditService: AuditService,
  ) {}

  /**
   * Chuyển mọi khu chuồng, mọi giáo án và các lớp nháp/đang chạy của một Head Trainer sang Head Trainer khác trong một transaction
   *
   * - Khóa khu, giáo án và lớp ACTIVE của người bàn giao, rồi khóa hai tài khoản theo thứ tự UUID, trước khi kiểm
   * - Lớp đã hoàn thành hoặc đã hủy giữ Head Trainer cũ
   * - Mỗi khu chuồng được chuyển ghi một dòng nhật ký
   * - Ghi thêm một dòng nhật ký tổng trên Head Trainer bàn giao: người nhận và số khu, giáo án, lớp đã chuyển
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param fromHeadTrainerId UUID của Head Trainer bàn giao
   * @param body Head Trainer nhận bàn giao
   * @returns Promise trả về số khu, số giáo án và số lớp đã chuyển
   * @throws ForbiddenException Nếu tài khoản người gọi không hoạt động
   * @throws NotFoundException Nếu người bàn giao không phải Head Trainer
   * @throws BadRequestException Nếu người nhận trùng người bàn giao, không có hoặc không phải Head Trainer
   * @throws ConflictException Nếu người nhận không ở trạng thái hoạt động, hoặc một buổi của lớp sẽ chuyển trùng giờ với buổi ở lớp của người nhận (không chuyển gì)
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
      await this.barns.lockHeadTrainerBarns(manager, fromHeadTrainerId);
      await this.training.lockHeadTrainerWork(manager, fromHeadTrainerId);
      const users = await this.lockedUsers(manager, [
        fromHeadTrainerId,
        body.toHeadTrainerId,
      ]);
      const from = users.get(fromHeadTrainerId);
      if (!from || from.role !== UserRole.HEAD_TRAINER) {
        throw new NotFoundException('Không tìm thấy Huấn luyện viên trưởng');
      }
      const to = users.get(body.toHeadTrainerId);
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
      const result = { barnsMoved, ...work };
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.USER,
        entityId: from.id,
        before: null,
        after: { toHeadTrainerId: to.id, ...result },
        feature: AuditFeature.HT_HANDOVER,
      });
      return result;
    });
  }

  /**
   * Khóa row các tài khoản theo thứ tự UUID để bàn giao không chạy song song với khóa tài khoản hay đổi vai trò
   *
   * @param manager EntityManager của transaction đang chạy
   * @param userIds UUID các tài khoản cần khóa
   * @returns Promise trả về Map từ UUID sang tài khoản đã khóa; tài khoản không có thì không có trong Map
   */
  private async lockedUsers(
    manager: EntityManager,
    userIds: string[],
  ): Promise<Map<string, UserEntity>> {
    const users = await manager.find(UserEntity, {
      where: { id: In(userIds) },
      order: { id: 'ASC' },
      lock: { mode: 'for_no_key_update' },
    });
    return new Map(users.map((user) => [user.id, user]));
  }
}
