import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BarnsService } from '../../stable/barns/barns.service';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { GROOM_ASSIGNMENT_CHANGED_EVENT } from '../../stable/constants/stable-events.constants';
import { GroomAssignmentsService } from '../../stable/groom-assignments/groom-assignments.service';
import { StallsService } from '../../stable/stalls/stalls.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import {
  AssignHorseBarnDto,
  BarnPreviewQueryDto,
  HorseBarnPreviewResponseDto,
  HorsePlacementResponseDto,
  HorseResponseDto,
  PlaceHorseDto,
} from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import { toHorseResponse } from '../mappers/horse.mapper';
import {
  HORSE_AUDIT_FEATURE,
  HORSE_BARN_ASSIGNED_EVENT,
} from '../constants/horse.constants';
import {
  toBarnPreviewResponse,
  toHorsePlacementResponse,
} from '../mappers/horse-placements.mapper';
import {
  assertBarnChangeReason,
  assertLifecycleWritable,
  barnChangeBlockedReason,
  barnChangeSummary,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import type {
  BarnPreviewTarget,
  HorseBarnAssignedEvent,
} from '../types/horse.types';
import { HorsePlacementsRepository } from './horse-placements.repository';

/**
 * Tiền tố lý do rút lớp khi đổi khu, nối với lý do người dùng nhập
 */
const BARN_CHANGE_WITHDRAW_REASON_PREFIX = 'Đổi khu: ';

/**
 * Lý do rút lớp khi xếp khu lần đầu (không có lý do người dùng nhập)
 */
const FIRST_BARN_WITHDRAW_REASON = 'Xếp khu';

/**
 * Dựng lý do rút lớp khi xếp hoặc đổi khu
 *
 * @param reason Lý do người dùng nhập, bỏ trống khi xếp khu lần đầu
 * @returns Lý do đổi khu kèm tiền tố, hoặc lý do xếp khu lần đầu khi bỏ trống
 */
function barnWithdrawReason(reason: string | undefined): string {
  return reason
    ? `${BARN_CHANGE_WITHDRAW_REASON_PREFIX}${reason}`
    : FIRST_BARN_WITHDRAW_REASON;
}

/**
 * Xếp và đổi khu chuồng cho ngựa; xếp ô kèm giao Groom trong một lần gửi. Luật xếp ô và phân công Groom do module stable quản lý.
 */
@Injectable()
export class HorsePlacementsService {
  constructor(
    private readonly access: HorseAccessService,
    private readonly barns: BarnsService,
    private readonly stalls: StallsService,
    private readonly events: DomainEventPublisher,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly training: TrainingOperationsFacade,
    private readonly grooms: GroomAssignmentsService,
    private readonly placements: HorsePlacementsRepository,
  ) {}

  /**
   * Xếp hoặc đổi khu chuồng cho ngựa. Chỉ Club Manager (kiểm ở controller).
   *
   * - Chỉ ngựa ACTIVE hoặc RETIRED; ngựa đã chuyển nhượng hoặc đã mất hoặc hồ sơ đã xóa thì không thao tác được
   * - Khu mới phải đang hoạt động, có Head Trainer phụ trách và còn ít nhất một ô trống (khóa row khu trước khi kiểm)
   * - Đổi khu: trả ô cũ về trống, ngựa vào "Chờ xếp ô" của khu mới; giữ nguyên Groom
   * - Chọn đúng khu đang ở thì không đổi gì
   * - Đổi khu (ngựa đã có khu) bắt buộc lý do, xếp khu lần đầu không cần; ghi nhật ký; ghi HORSE_BARN_ASSIGNED_EVENT vào outbox trong cùng transaction để báo Head Trainer khu mới
   * - Rút ngựa khỏi mọi lớp không do Head Trainer khu mới phụ trách; có rút thì nhật ký ghi thêm classesWithdrawn
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Khu mới và lý do (bỏ trống được khi xếp khu lần đầu)
   * @returns Promise trả về hồ sơ ngựa sau khi xếp khu
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   * @throws BadRequestException Nếu đổi khu (ngựa đã có khu) mà không có lý do
   * @throws ConflictException Nếu Club Manager thao tác hồ sơ đã xóa (phải khôi phục trước), ngựa đã chuyển nhượng hoặc đã mất, hoặc khu không hoạt động, chưa có Head Trainer, hết ô trống
   */
  async assignBarn(
    actor: Actor,
    horseId: string,
    body: AssignHorseBarnDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    await this.dataSource.transaction(async (manager) => {
      const horse = await this.access.lockWritableHorse(
        manager,
        actor,
        horseId,
      );
      assertLifecycleWritable(horse);
      if (horse.barnId === body.barnId) return;
      assertBarnChangeReason(horse.barnId, body.reason);
      await this.applyBarnChange(manager, {
        callerId: caller.id,
        horseId,
        fromBarnId: horse.barnId,
        toBarnId: body.barnId,
        reason: body.reason,
      });
      const event: HorseBarnAssignedEvent = {
        eventId: randomUUID(),
        horseId,
        barnId: body.barnId,
      };
      await this.events.publish(manager, HORSE_BARN_ASSIGNED_EVENT, event);
    });
    return toHorseResponse(await this.access.findNotDeletedHorse(horseId));
  }

  /**
   * Chuyển ngựa sang khu mới trong transaction đang chạy, ghi một dòng nhật ký
   *
   * - Khóa khu mới và kiểm khu nhận được ngựa, trả ô đang giữ về trống
   * - Rút ngựa khỏi mọi lớp không do Head Trainer khu mới phụ trách
   * - Cập nhật khu của ngựa rồi ghi nhật ký; có rút lớp thì nhật ký ghi thêm classesWithdrawn
   * - Không phát event; nơi gọi phát sau khi commit
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Người gọi, ngựa, khu hiện tại (null nếu chưa có khu), khu mới và lý do (bỏ trống khi xếp khu lần đầu)
   * @returns Promise hoàn tất khi đã đổi khu và ghi nhật ký
   * @throws NotFoundException Nếu không có khu
   * @throws ConflictException Nếu khu không hoạt động, chưa có Head Trainer hoặc hết ô trống
   */
  private async applyBarnChange(
    manager: EntityManager,
    input: {
      callerId: string;
      horseId: string;
      fromBarnId: string | null;
      toBarnId: string;
      reason?: string;
    },
  ): Promise<void> {
    const { callerId, horseId, reason } = input;
    const newBarn = await this.barns.lockAssignableBarn(
      manager,
      input.toBarnId,
    );
    const released = await this.stalls.closeOpenStallAssignment(
      manager,
      horseId,
    );
    const keptHeadTrainerId = newBarn.headTrainerId ?? undefined;
    const withdrawn = await this.training.withdrawHorseFromClasses(
      manager,
      horseId,
      {
        reason: barnWithdrawReason(reason),
        at: new Date(),
        exceptHeadTrainerId: keptHeadTrainerId,
      },
    );
    await manager
      .getRepository(HorseEntity)
      .update({ id: horseId }, { barnId: input.toBarnId });
    await this.auditService.record(manager, {
      actorId: callerId,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: horseId,
      before: {
        barnId: input.fromBarnId,
        stallCode: released?.stallCode ?? null,
      },
      after: {
        barnId: input.toBarnId,
        stallCode: null,
        ...(withdrawn.classIds.length
          ? { classesWithdrawn: withdrawn.classIds.length }
          : {}),
      },
      reason: reason ?? null,
      feature: HORSE_AUDIT_FEATURE.BARN_PLACEMENT,
    });
  }

  /**
   * Xem trước hệ quả của việc đổi khu. Không ghi gì
   *
   * - Dùng cùng luật rút lớp như assignBarn: mọi lớp không do Head Trainer khu mới phụ trách
   * - Ngựa đã chuyển nhượng hoặc đã mất hoặc đang ở đúng khu này thì trả allowed = false kèm lý do
   * - Không kiểm sức chứa, trạng thái khu; các điều kiện đó kiểm lúc đổi thật
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Khu muốn chuyển sang
   * @returns Promise trả về cờ đổi được, lý do chặn, từng hệ quả và câu tóm tắt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   * @throws ConflictException Nếu Club Manager xem trước trên hồ sơ đã xóa
   */
  async previewBarnChange(
    actor: Actor,
    horseId: string,
    query: BarnPreviewQueryDto,
  ): Promise<HorseBarnPreviewResponseDto> {
    await this.access.currentUser(actor);
    const horse = await this.access.findWritableHorse(actor, horseId);
    const target = await this.findBarnWithHeadTrainer(query.barnId);
    if (!target) throw new NotFoundException('Không tìm thấy khu chuồng');
    const blockedReason = barnChangeBlockedReason(
      horse.lifecycleStatus,
      horse.barnId,
      target.id,
    );
    const impact = await this.placements.barnChangeImpact(
      horseId,
      target.headTrainerId,
    );
    return toBarnPreviewResponse({
      horseId,
      target,
      blockedReason,
      impact,
      summary:
        blockedReason === null
          ? barnChangeSummary(
              horse.name,
              target.name,
              target.headTrainerName,
              impact,
            )
          : null,
    });
  }

  /**
   * Xếp ô và giao groom cho ngựa trong một lần gửi, thành công cả hai hoặc không lưu gì
   *
   * - Luật xếp ô như StallsService.moveHorseToStall, luật giao groom như GroomAssignmentsService.assign
   * - Chạy cả hai trong cùng một transaction; GROOM_ASSIGNMENT_CHANGED_EVENT ghi vào outbox trong cùng transaction
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Ô chuồng và groom được giao
   * @returns Promise trả về phân công ô và phân công groom đang mở của ngựa
   * @throws BadRequestException Nếu ô không thuộc khu của ngựa, hoặc groom không có hoặc không phải Groom
   * @throws NotFoundException Nếu không có ngựa, không có khu hoặc không có ô
   * @throws ForbiddenException Nếu tài khoản không hoạt động hoặc người gọi không phụ trách khu của ngựa
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng hoặc đã mất, khu không hoạt động, ô không còn trống, groom không còn hoạt động hoặc có thao tác khác chạy cùng lúc
   */
  async placeHorse(
    actor: Actor,
    horseId: string,
    body: PlaceHorseDto,
  ): Promise<HorsePlacementResponseDto> {
    const caller = await this.access.currentUser(actor);
    const { stallAssignment, groom } = await this.dataSource.transaction(
      async (manager) => {
        const stallAssignment = await this.stalls.moveHorseToStallInTransaction(
          manager,
          caller.id,
          horseId,
          body.stallId,
        );
        const groom = await this.grooms.assignInTransaction(
          manager,
          caller.id,
          horseId,
          body.groomId,
        );
        if (groom.changedEvent) {
          await this.events.publish(
            manager,
            GROOM_ASSIGNMENT_CHANGED_EVENT,
            groom.changedEvent,
          );
        }
        return { stallAssignment, groom };
      },
    );
    return toHorsePlacementResponse(stallAssignment, groom.response);
  }

  /**
   * Lấy khu chuồng chưa xóa kèm Head Trainer phụ trách
   *
   * @param barnId UUID của khu
   * @returns Promise trả về khu kèm tên Head Trainer, null nếu không có khu
   */
  private async findBarnWithHeadTrainer(
    barnId: string,
  ): Promise<BarnPreviewTarget | null> {
    const barn = await this.dataSource
      .getRepository(BarnEntity)
      .createQueryBuilder('barn')
      .withDeleted()
      .leftJoinAndSelect('barn.headTrainer', 'headTrainer')
      .where('barn.id = :barnId', { barnId })
      .andWhere('barn.deletedAt IS NULL')
      .getOne();
    if (!barn) return null;
    return {
      id: barn.id,
      name: barn.name,
      headTrainerId: barn.headTrainerId,
      headTrainerName: barn.headTrainer?.fullName ?? null,
    };
  }
}
