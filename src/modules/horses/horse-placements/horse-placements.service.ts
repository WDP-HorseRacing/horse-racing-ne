import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BarnsService } from '../../stable/barns/barns.service';
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
import { HORSE_BARN_ASSIGNED_EVENT } from '../constants/horse.constants';
import { toBarnPreviewResponse } from '../mappers/horse-placements.mapper';
import {
  barnChangeBlockedReason,
  barnChangeSummary,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import type { HorseBarnAssignedEvent } from '../types/horse.types';
import { HorsePlacementsRepository } from './horse-placements.repository';

/**
 * Xếp và đổi khu chuồng cho ngựa (F1.6). Việc xếp ô và phân công Groom (F1.7) thuộc module stable.
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
   * Xếp hoặc đổi khu chuồng cho ngựa (F1.6). Chỉ Club Manager (kiểm ở controller).
   *
   * - Chỉ ngựa ACTIVE hoặc RETIRED; ngựa đã chuyển nhượng hoặc hồ sơ đã xóa thì không thao tác được
   * - Khu mới phải đang hoạt động, có Head Trainer phụ trách và còn ít nhất một ô trống (khóa row khu trước khi kiểm)
   * - Đổi khu: trả ô cũ về trống, ngựa vào "Chờ xếp ô" của khu mới; giữ nguyên Groom vì Groom gắn với con ngựa
   * - Chọn đúng khu đang ở thì không đổi gì
   * - Bắt buộc lý do; ghi nhật ký; sau khi commit phát HORSE_BARN_ASSIGNED_EVENT để module notifications báo Head Trainer khu mới
   * - Rút ngựa khỏi mọi lớp không do Head Trainer khu mới phụ trách; có rút thì nhật ký ghi thêm classesWithdrawn
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Khu mới và lý do
   * @returns Promise trả về hồ sơ ngựa sau khi xếp khu
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc hồ sơ đã xóa (phải khôi phục trước)
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   * @throws ConflictException Nếu ngựa đã chuyển nhượng, hoặc khu không hoạt động, chưa có Head Trainer, hết ô trống
   */
  async assignBarn(
    actor: Actor,
    horseId: string,
    body: AssignHorseBarnDto,
  ): Promise<HorseResponseDto> {
    const caller = await this.access.currentUser(actor);
    const changed = await this.dataSource.transaction(async (manager) => {
      const horse = await this.access.lockWritableHorse(
        manager,
        actor,
        horseId,
      );
      this.access.assertNotTransferred(horse);
      if (horse.barnId === body.barnId) return false;
      const newBarn = await this.barns.lockAssignableBarn(manager, body.barnId);
      const released = await this.stalls.releaseStallByHorse(manager, horseId);
      const withdrawn = await this.training.withdrawHorseFromClasses(
        manager,
        horseId,
        {
          reason: `Đổi khu: ${body.reason}`,
          at: new Date(),
          exceptHeadTrainerId: newBarn.headTrainerId ?? undefined,
        },
      );
      await manager
        .getRepository(HorseEntity)
        .update({ id: horseId }, { barnId: body.barnId });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE,
        entityId: horseId,
        before: {
          barnId: horse.barnId,
          stallCode: released?.stallCode ?? null,
        },
        after: {
          barnId: body.barnId,
          stallCode: null,
          ...(withdrawn.classIds.length
            ? { classesWithdrawn: withdrawn.classIds.length }
            : {}),
        },
        reason: body.reason,
        feature: 'F1.6',
      });
      return true;
    });
    if (changed) {
      const event: HorseBarnAssignedEvent = {
        eventId: randomUUID(),
        horseId,
        barnId: body.barnId,
      };
      this.events.publish(HORSE_BARN_ASSIGNED_EVENT, event);
    }
    return toHorseResponse(await this.access.findHorse(horseId));
  }

  /**
   * Xem trước hệ quả của việc đổi khu để Club Manager xác nhận trước khi lưu. Không ghi gì
   *
   * - Dùng cùng luật rút lớp như assignBarn: mọi lớp không do Head Trainer khu mới phụ trách
   * - Ngựa đã chuyển nhượng hoặc đang ở đúng khu này thì trả allowed = false kèm lý do
   * - Không kiểm sức chứa, trạng thái khu; các điều kiện đó kiểm lúc đổi thật
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Khu muốn chuyển sang
   * @returns A promise resolving to cờ đổi được, lý do chặn, từng hệ quả và câu tóm tắt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động, hoặc hồ sơ đã xóa
   * @throws NotFoundException Nếu không có ngựa hoặc không có khu
   */
  async previewBarnChange(
    actor: Actor,
    horseId: string,
    query: BarnPreviewQueryDto,
  ): Promise<HorseBarnPreviewResponseDto> {
    await this.access.currentUser(actor);
    const horse = await this.access.findWritableHorse(actor, horseId);
    const target = await this.placements.findBarn(query.barnId);
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
    return toBarnPreviewResponse(
      horseId,
      target,
      blockedReason,
      impact,
      blockedReason === null
        ? barnChangeSummary(
            horse.name,
            target.name,
            target.headTrainerName,
            impact,
          )
        : null,
    );
  }

  /**
   * Xếp ô và giao groom cho ngựa trong một lần gửi, thành công cả hai hoặc không lưu gì
   *
   * - Luật xếp ô như StallsService.moveHorseToStall, luật giao groom như GroomAssignmentsService.assign
   * - Chạy cả hai trong cùng một transaction; sau khi commit mới phát GROOM_ASSIGNMENT_CHANGED_EVENT
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Ô chuồng và groom được giao
   * @returns A promise resolving to phân công ô và phân công groom đang mở của ngựa
   * @throws BadRequestException Nếu ô không thuộc khu của ngựa, hoặc groom không có hoặc không phải Groom
   * @throws NotFoundException Nếu không có ngựa, không có khu hoặc không có ô
   * @throws ForbiddenException Nếu tài khoản không hoạt động hoặc người gọi không phụ trách khu của ngựa
   * @throws ConflictException Nếu ngựa chưa được xếp khu, đã chuyển nhượng, khu không hoạt động, ô không còn trống, groom không còn hoạt động hoặc có thao tác khác chạy cùng lúc
   */
  async placeHorse(
    actor: Actor,
    horseId: string,
    body: PlaceHorseDto,
  ): Promise<HorsePlacementResponseDto> {
    const caller = await this.access.currentUser(actor);
    const { stallAssignment, groom } = await this.dataSource.transaction(
      async (manager) => ({
        stallAssignment: await this.stalls.moveHorseToStallInTransaction(
          manager,
          caller.id,
          horseId,
          body.stallId,
        ),
        groom: await this.grooms.assignInTransaction(
          manager,
          caller.id,
          horseId,
          body.groomId,
        ),
      }),
    );
    if (groom.notice) {
      this.events.publish(GROOM_ASSIGNMENT_CHANGED_EVENT, groom.notice);
    }
    return { stallAssignment, groomAssignment: groom.response };
  }
}
