import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  IsNull,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { BILLING_SURCHARGE_ADDED_EVENT } from '../constants/billing-events.constants';
import {
  CreateHorseSurchargeDto,
  HorseSurchargeResponseDto,
  UnappliedSurchargeResponseDto,
} from '../dto/horse-surcharge.dto';
import { HorseSurchargeEntity } from '../entities/horse-surcharge.entity';
import {
  toHorseSurchargeResponse,
  toUnappliedSurchargeResponse,
} from '../mappers/horse-surcharge.mapper';
import {
  assertSurchargeApplicable,
  assertSurchargeDates,
  assertSurchargeDeletable,
  assertSurchargeEndable,
} from '../policies/horse-surcharge.policy';
import type { SurchargeAddedEvent } from '../types/billing-events.types';

const SURCHARGE_NOT_FOUND = 'Không tìm thấy phụ phí';

/**
 * Phụ phí chăm sóc riêng của từng ngựa: xem, ghi, kết thúc sớm, xóa khoản chưa bắt đầu
 */
@Injectable()
export class HorseSurchargesService {
  constructor(
    @InjectRepository(HorseSurchargeEntity)
    private readonly surcharges: Repository<HorseSurchargeEntity>,
    private readonly horses: HorseAccessService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Liệt kê phụ phí của một ngựa, ngày bắt đầu mới nhất trước
   *
   * - Club Manager: mọi ngựa
   * - Horse Owner: ngựa mình đang là chủ
   * - Head Trainer: ngựa thuộc khu mình phụ trách
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về các khoản phụ phí
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc Head Trainer xem ngựa ngoài khu
   * @throws NotFoundException Nếu không có ngựa, hoặc chủ ngựa xem ngựa không phải của mình
   */
  async list(
    actor: Actor,
    horseId: string,
  ): Promise<HorseSurchargeResponseDto[]> {
    const manager = this.dataSource.manager;
    const caller = await this.horses.currentUser(actor, manager);
    await this.horses.findReadableHorse(manager, actor, caller.id, horseId);
    await this.horses.assertTrainerBarn(manager, actor, caller.id, horseId);
    const rows = await this.surcharges.find({
      where: { horseId },
      relations: { applier: true },
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(toHorseSurchargeResponse);
  }

  /**
   * Liệt kê các khoản phụ phí chưa được Head Trainer xác nhận áp dụng và chưa kết thúc, cho Club Manager theo dõi
   *
   * - Kèm tên ngựa, khu hiện tại và Head Trainer đang phụ trách khu (null nếu ngựa chưa xếp khu hoặc khu chưa có Head Trainer hoạt động)
   * - Bỏ ngựa có hồ sơ đã xóa; ngày bắt đầu sớm nhất trước
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về các khoản phụ phí chưa áp dụng
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   */
  async listUnapplied(actor: Actor): Promise<UnappliedSurchargeResponseDto[]> {
    await this.horses.currentUser(actor);
    const rows = await this.surcharges.find({
      where: { appliedAt: IsNull(), endDate: MoreThanOrEqual(clubToday()) },
      relations: { horse: { barn: { headTrainer: true } } },
      order: { startDate: 'ASC', createdAt: 'ASC' },
    });
    return rows.map(toUnappliedSurchargeResponse);
  }

  /**
   * Head Trainer khu hiện tại của ngựa xác nhận đã sắp xếp đủ chế độ chăm sóc theo nội dung phụ phí
   *
   * - Ghi người xác nhận và thời điểm; ghi nhật ký
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khoản phụ phí
   * @returns Promise trả về khoản phụ phí sau khi xác nhận
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc người gọi không phải Head Trainer khu hiện tại của ngựa
   * @throws NotFoundException Nếu không có khoản phụ phí
   * @throws ConflictException Nếu khoản phụ phí đã được xác nhận hoặc đã kết thúc
   */
  async apply(actor: Actor, id: string): Promise<HorseSurchargeResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.horses.currentUser(actor, manager);
      const row = await this.lockedSurcharge(manager, id);
      if (
        !(await this.horses.isHorseInTrainerBarn(
          manager,
          row.horseId,
          caller.id,
        ))
      ) {
        throw new ForbiddenException(
          'Chỉ Head Trainer khu hiện tại của ngựa xác nhận được',
        );
      }
      assertSurchargeApplicable(row.appliedAt, row.endDate, clubToday());
      row.appliedBy = caller.id;
      row.appliedAt = new Date();
      await manager.save(row);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE_SURCHARGE,
        entityId: id,
        before: { appliedAt: null },
        after: { appliedAt: row.appliedAt.toISOString() },
        feature: AuditFeature.HORSE_SURCHARGE,
      });
      return manager.findOneOrFail(HorseSurchargeEntity, {
        where: { id },
        relations: { applier: true },
      });
    });
    return toHorseSurchargeResponse(saved);
  }

  /**
   * Ghi một khoản phụ phí cho ngựa, báo Head Trainer khu của ngựa qua outbox
   *
   * - Ngựa phải còn ở CLB (đang hoạt động hoặc đã giải nghệ)
   * - Ngày bắt đầu từ hôm nay trở đi, ngày kết thúc không trước ngày bắt đầu
   * - Ghi nhật ký kèm nội dung, phí ngày và khoảng ngày
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Nội dung, phí một ngày và khoảng ngày
   * @returns Promise trả về khoản phụ phí vừa ghi
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có ngựa
   * @throws BadRequestException Nếu khoảng ngày sai
   * @throws ConflictException Nếu hồ sơ ngựa đã xóa, hoặc ngựa không còn ở CLB
   */
  async create(
    actor: Actor,
    horseId: string,
    body: CreateHorseSurchargeDto,
  ): Promise<HorseSurchargeResponseDto> {
    assertSurchargeDates(body.startDate, body.endDate, clubToday());
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.horses.currentUser(actor, manager);
      const horse = await this.horses.lockWritableHorse(
        manager,
        actor,
        horseId,
      );
      if (
        horse.lifecycleStatus !== HorseLifecycleStatus.ACTIVE &&
        horse.lifecycleStatus !== HorseLifecycleStatus.RETIRED
      ) {
        throw new ConflictException(
          'Ngựa không còn ở câu lạc bộ, không ghi phụ phí được',
        );
      }
      const row = await manager.save(
        manager.create(HorseSurchargeEntity, {
          horseId,
          description: body.description.trim(),
          dailyAmount: body.dailyAmount.toString(),
          startDate: body.startDate,
          endDate: body.endDate,
          createdBy: caller.id,
        }),
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.HORSE_SURCHARGE,
        entityId: row.id,
        before: null,
        after: {
          horseId,
          description: row.description,
          dailyAmount: body.dailyAmount,
          startDate: row.startDate,
          endDate: row.endDate,
        },
        feature: AuditFeature.HORSE_SURCHARGE,
      });
      const event: SurchargeAddedEvent = {
        eventId: row.id,
        horseId,
        description: row.description,
        dailyAmount: body.dailyAmount,
        startDate: row.startDate,
        endDate: row.endDate,
      };
      await this.events.publish(manager, BILLING_SURCHARGE_ADDED_EVENT, event);
      return row;
    });
    return toHorseSurchargeResponse(saved);
  }

  /**
   * Kết thúc sớm một khoản phụ phí đang tính: ngày kết thúc thành hôm nay, hôm nay vẫn tính phí
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khoản phụ phí
   * @returns Promise trả về khoản phụ phí sau khi kết thúc
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có khoản phụ phí
   * @throws ConflictException Nếu khoản phụ phí chưa bắt đầu hoặc đã kết thúc
   */
  async end(actor: Actor, id: string): Promise<HorseSurchargeResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.horses.currentUser(actor, manager);
      const row = await this.lockedSurcharge(manager, id);
      const today = clubToday();
      assertSurchargeEndable(row.startDate, row.endDate, today);
      const before = { endDate: row.endDate };
      row.endDate = today;
      const ended = await manager.save(row);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE_SURCHARGE,
        entityId: id,
        before,
        after: { endDate: today },
        feature: AuditFeature.HORSE_SURCHARGE,
      });
      return ended;
    });
    return toHorseSurchargeResponse(saved);
  }

  /**
   * Xóa một khoản phụ phí chưa tới ngày bắt đầu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của khoản phụ phí
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có khoản phụ phí
   * @throws ConflictException Nếu khoản phụ phí đã bắt đầu tính
   */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const caller = await this.horses.currentUser(actor, manager);
      const row = await this.lockedSurcharge(manager, id);
      assertSurchargeDeletable(row.startDate, clubToday());
      await manager.delete(HorseSurchargeEntity, { id });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.HORSE_SURCHARGE,
        entityId: id,
        before: {
          horseId: row.horseId,
          description: row.description,
          dailyAmount: Number(row.dailyAmount),
          startDate: row.startDate,
          endDate: row.endDate,
        },
        after: null,
        feature: AuditFeature.HORSE_SURCHARGE,
      });
    });
  }

  /**
   * Khóa một khoản phụ phí để sửa hoặc xóa
   *
   * @param manager EntityManager của transaction đang chạy
   * @param id UUID của khoản phụ phí
   * @returns Promise trả về khoản phụ phí đã khóa
   * @throws NotFoundException Nếu không có khoản phụ phí
   */
  private async lockedSurcharge(
    manager: EntityManager,
    id: string,
  ): Promise<HorseSurchargeEntity> {
    const row = await manager.findOne(HorseSurchargeEntity, {
      where: { id },
      lock: { mode: 'for_no_key_update' },
    });
    if (!row) throw new NotFoundException(SURCHARGE_NOT_FOUND);
    return row;
  }
}
