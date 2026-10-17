import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { randomUUID } from 'node:crypto';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import type { FieldError } from '../../../common/utils/field-errors';
import { containsPattern } from '../../../common/utils/like-pattern';
import { compareDecimal } from '../../../common/utils/decimal';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CancelSupplyUsageDto,
  CreateSupplyItemDto,
  SupplyItemListQueryDto,
  SupplyItemPageResponseDto,
  SupplyItemResponseDto,
  SupplyLotResponseDto,
  SupplyReceiptDto,
  SupplyUsageDto,
  SupplyStockMovementPageResponseDto,
  UpdateSupplyItemDto,
} from '../dto/supply-item.dto';
import { SUPPLY_LOW_STOCK_EVENT } from '../constants/supply-events.constants';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyLotEntity } from '../entities/supply-lot.entity';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';
import {
  toSupplyItemResponse,
  toSupplyLotResponse,
  toSupplyStockMovementResponse,
} from '../mappers/supply-item.mapper';
import {
  assertUsageCancellable,
  assertUsageNotCancelled,
} from '../policies/supplies.policy';
import {
  SUPPLY_ITEM_NOT_FOUND,
  SupplyStockService,
} from '../shared/supply-stock.service';
import type { SupplyLowStockEvent } from '../types/supply-events.types';

const SUPPLY_ITEM_NAME_TAKEN: FieldError = {
  field: 'name',
  message: 'Tên vật tư đã tồn tại',
};

/**
 * Danh mục vật tư của kho chung CLB: thêm, sửa, xóa, nhập hàng, xuất dùng, lô và sổ nhập xuất
 */
@Injectable()
export class SupplyItemsService {
  constructor(
    @InjectRepository(SupplyItemEntity)
    private readonly items: Repository<SupplyItemEntity>,
    @InjectRepository(SupplyStockMovementEntity)
    private readonly movements: Repository<SupplyStockMovementEntity>,
    @InjectRepository(SupplyLotEntity)
    private readonly lots: Repository<SupplyLotEntity>,
    private readonly stock: SupplyStockService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Liệt kê vật tư chưa xóa theo tên, có lọc loại và tìm theo tên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Bộ lọc và phân trang
   * @returns Promise trả về một trang vật tư
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   */
  async list(
    actor: Actor,
    query: SupplyItemListQueryDto,
  ): Promise<SupplyItemPageResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const search = query.search?.trim();
    const [rows, total] = await this.items.findAndCount({
      where: {
        deletedAt: IsNull(),
        ...(query.category ? { category: query.category } : {}),
        ...(search ? { name: ILike(containsPattern(search)) } : {}),
      },
      withDeleted: true,
      order: { name: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return new PaginationResponseDto(
      rows.map(toSupplyItemResponse),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Liệt kê vật tư sắp hết: số tồn nhỏ hơn hoặc bằng ngưỡng báo thiếu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về các vật tư sắp hết, sắp theo tên
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   */
  async lowStock(actor: Actor): Promise<SupplyItemResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const rows = await this.items
      .createQueryBuilder('item')
      .withDeleted()
      .where('item.deletedAt IS NULL')
      .andWhere('item.quantityOnHand <= item.reorderThreshold')
      .orderBy('item.name', 'ASC')
      .getMany();
    return rows.map(toSupplyItemResponse);
  }

  /**
   * Thêm vật tư; số tồn ban đầu khác 0 thì tạo lô đầu tiên với dòng sổ OPENING
   *
   * - Ghi nhật ký kèm tên, loại, đơn vị, số tồn ban đầu, đơn giá lô đầu, ngưỡng báo thiếu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Tên, loại, đơn vị, số tồn ban đầu, đơn giá lô đầu, ngưỡng báo thiếu
   * @returns Promise trả về vật tư vừa thêm
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws ConflictException Nếu tên vật tư đã tồn tại
   */
  async create(
    actor: Actor,
    body: CreateSupplyItemDto,
  ): Promise<SupplyItemResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const id = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const item = await manager.save(
            manager.create(SupplyItemEntity, {
              name: body.name.trim(),
              category: body.category,
              unit: body.unit.trim(),
              quantityOnHand: '0',
              reorderThreshold: body.reorderThreshold.toString(),
            }),
          );
          const openingUnitPrice = body.openingUnitPrice ?? 0;
          if (body.quantityOnHand) {
            await this.stock.addLot(manager, item, {
              quantity: body.quantityOnHand.toString(),
              unitPrice: openingUnitPrice.toString(),
              type: SupplyStockMovementType.OPENING,
              actorId: caller.id,
              requestId: null,
              note: null,
            });
          }
          await this.auditService.record(manager, {
            actorId: caller.id,
            action: AuditAction.CREATE,
            entityType: AuditEntityType.SUPPLY_ITEM,
            entityId: item.id,
            before: null,
            after: {
              name: item.name,
              category: item.category,
              unit: item.unit,
              quantityOnHand: Number(item.quantityOnHand),
              openingUnitPrice,
              reorderThreshold: Number(item.reorderThreshold),
            },
            feature: AuditFeature.SUPPLY_ITEM,
          });
          return item.id;
        }),
      SUPPLY_ITEM_NAME_TAKEN,
    );
    return this.get(actor, id);
  }

  /**
   * Lấy một vật tư chưa xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @returns Promise trả về vật tư
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  async get(actor: Actor, id: string): Promise<SupplyItemResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const row = await this.items.findOne({
      where: { id, deletedAt: IsNull() },
      withDeleted: true,
    });
    if (!row) throw new NotFoundException(SUPPLY_ITEM_NOT_FOUND);
    return toSupplyItemResponse(row);
  }

  /**
   * Sửa tên, loại, đơn vị, ngưỡng báo thiếu; không đổi số tồn
   *
   * - Có field đổi giá trị: ghi nhật ký giá trị trước và sau của các field đó
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @param body Các field cần sửa, field không gửi giữ giá trị cũ
   * @returns Promise trả về vật tư sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   * @throws ConflictException Nếu tên vật tư đã tồn tại
   */
  async update(
    actor: Actor,
    id: string,
    body: UpdateSupplyItemDto,
  ): Promise<SupplyItemResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const item = await this.stock.lockItem(manager, id);
          const before = auditedItemFields(item);
          Object.assign(item, {
            name: body.name?.trim() ?? item.name,
            category: body.category ?? item.category,
            unit: body.unit?.trim() ?? item.unit,
            reorderThreshold:
              body.reorderThreshold?.toString() ?? item.reorderThreshold,
          });
          await manager.save(item);
          const diff = changedFieldsDiff(before, auditedItemFields(item));
          if (!diff) return;
          await this.auditService.record(manager, {
            actorId: caller.id,
            action: AuditAction.UPDATE,
            entityType: AuditEntityType.SUPPLY_ITEM,
            entityId: id,
            ...diff,
            feature: AuditFeature.SUPPLY_ITEM,
          });
        }),
      SUPPLY_ITEM_NAME_TAKEN,
    );
    return this.get(actor, id);
  }

  /**
   * Xóa mềm vật tư; đề xuất và sổ nhập xuất cũ vẫn giữ
   *
   * - Ghi nhật ký kèm tên, loại, đơn vị của vật tư bị xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   * @throws ConflictException Nếu vật tư còn đề xuất PENDING hoặc APPROVED
   */
  async remove(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const item = await this.stock.lockItem(manager, id);
      const hasOpenRequest = await manager.exists(SupplyRequestEntity, {
        where: {
          itemId: id,
          status: In([
            SupplyRequestStatus.PENDING,
            SupplyRequestStatus.APPROVED,
          ]),
        },
      });
      if (hasOpenRequest) {
        throw new ConflictException('Vật tư còn đề xuất chưa xử lý');
      }
      await manager.softDelete(SupplyItemEntity, { id });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.SUPPLY_ITEM,
        entityId: id,
        before: { name: item.name, category: item.category, unit: item.unit },
        after: null,
        feature: AuditFeature.SUPPLY_ITEM,
      });
    });
  }

  /**
   * Club Manager nhập hàng trực tiếp, không qua đề xuất
   *
   * - Tạo một lô với đơn giá của lần nhập, cộng tồn, ghi dòng sổ RESTOCK
   * - Ghi nhật ký số tồn trước và sau, ghi chú làm lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @param body Số lượng nhập, đơn giá và ghi chú
   * @returns Promise trả về vật tư sau khi nhập
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  async receive(
    actor: Actor,
    id: string,
    body: SupplyReceiptDto,
  ): Promise<SupplyItemResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const note = body.note?.trim() || null;
      const { previousQuantity, item, lot } = await this.stock.restock(
        manager,
        id,
        {
          quantity: body.quantity.toString(),
          unitPrice: body.unitPrice.toString(),
          actorId: caller.id,
          requestId: null,
          note,
        },
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.SUPPLY_ITEM,
        entityId: id,
        before: { quantityOnHand: Number(previousQuantity) },
        after: {
          quantityOnHand: Number(item.quantityOnHand),
          received: body.quantity,
          unitPrice: body.unitPrice,
          lotId: lot.id,
        },
        reason: note,
        feature: AuditFeature.SUPPLY_STOCK,
      });
    });
    return this.get(actor, id);
  }

  /**
   * Lấy vật tư ra dùng: trừ tồn ngay theo nhập trước xuất trước, không cần duyệt
   *
   * - Trừ các lô nhập sớm nhất trước; mỗi lô bị trừ ghi một dòng sổ USAGE
   * - Ghi nhật ký số tồn trước và sau, phần lấy từ từng lô, ghi chú làm lý do
   * - Số tồn xuống từ trên ngưỡng báo thiếu tới hoặc dưới ngưỡng: ghi SUPPLY_LOW_STOCK_EVENT vào outbox để báo Club Manager
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @param body Số lượng lấy và ghi chú
   * @returns Promise trả về vật tư sau khi trừ tồn
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   * @throws ConflictException Nếu số lượng lấy lớn hơn số tồn
   */
  async use(
    actor: Actor,
    id: string,
    body: SupplyUsageDto,
  ): Promise<SupplyItemResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const item = await this.stock.lockItem(manager, id);
      const before = Number(item.quantityOnHand);
      const wasAboveThreshold =
        compareDecimal(item.quantityOnHand, item.reorderThreshold) > 0;
      const note = body.note?.trim() || null;
      const {
        item: saved,
        usageId,
        takings,
      } = await this.stock.consume(
        manager,
        item,
        body.quantity.toString(),
        caller.id,
        note,
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.SUPPLY_ITEM,
        entityId: id,
        before: { quantityOnHand: before },
        after: {
          quantityOnHand: Number(saved.quantityOnHand),
          used: body.quantity,
          usageId,
          lots: takings.map((taking) => ({
            lotId: taking.lotId,
            quantity: Number(taking.quantity),
            unitPrice: Number(taking.unitPrice),
          })),
        },
        reason: note,
        feature: AuditFeature.SUPPLY_STOCK,
      });
      if (
        wasAboveThreshold &&
        compareDecimal(saved.quantityOnHand, saved.reorderThreshold) <= 0
      ) {
        const event: SupplyLowStockEvent = {
          eventId: randomUUID(),
          itemId: saved.id,
          itemName: saved.name,
          unit: saved.unit,
          quantityOnHand: Number(saved.quantityOnHand),
          reorderThreshold: Number(saved.reorderThreshold),
        };
        await this.events.publish(manager, SUPPLY_LOW_STOCK_EVENT, event);
      }
    });
    return this.get(actor, id);
  }

  /**
   * Liệt kê sổ nhập xuất của một vật tư, mới nhất trước
   *
   * - Vật tư đã xóa vẫn xem được sổ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @param query Phân trang
   * @returns Promise trả về một trang dòng sổ
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư
   */
  async movementsOf(
    actor: Actor,
    id: string,
    query: PaginationQueryDto,
  ): Promise<SupplyStockMovementPageResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const exists = await this.items.exists({
      where: { id },
      withDeleted: true,
    });
    if (!exists) throw new NotFoundException(SUPPLY_ITEM_NOT_FOUND);
    const [rows, total] = await this.movements.findAndCount({
      where: { itemId: id },
      relations: { creator: true, lot: true },
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    const usageIds = rows
      .filter((row) => row.type === SupplyStockMovementType.USAGE)
      .map((row) => row.usageId)
      .filter((usageId): usageId is string => usageId !== null);
    const cancelled = new Set(
      usageIds.length === 0
        ? []
        : (
            await this.movements.find({
              select: { usageId: true },
              where: {
                usageId: In(usageIds),
                type: SupplyStockMovementType.USAGE_REVERSAL,
              },
            })
          ).map((row) => row.usageId),
    );
    return new PaginationResponseDto(
      rows.map((row) =>
        toSupplyStockMovementResponse(
          row,
          row.type === SupplyStockMovementType.USAGE &&
            cancelled.has(row.usageId),
        ),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Hủy một lần xuất kho ghi nhầm: cộng trả đúng số đã trừ vào từng lô và vào số tồn
   *
   * - Người xuất tự hủy trong 24 giờ kể từ lúc xuất; Club Manager hủy bất kỳ lúc nào
   * - Khóa vật tư trước khi kiểm đã hủy chưa, nên hai lần hủy cùng lúc chỉ một lần thành công
   * - Mỗi lô ghi một dòng sổ USAGE_REVERSAL cùng mã lần xuất, lý do làm ghi chú
   * - Ghi nhật ký số tồn trước và sau, mã lần xuất, phần trả lại từng lô, lý do
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param usageId Mã lần xuất
   * @param body Lý do hủy
   * @returns Promise trả về vật tư sau khi cộng trả
   * @throws ForbiddenException Nếu tài khoản không hoạt động, người gọi không phải người xuất hay Club Manager, hoặc người xuất đã quá 24 giờ
   * @throws NotFoundException Nếu không có lần xuất hoặc vật tư đã xóa
   * @throws ConflictException Nếu lần xuất đã được hủy
   */
  async cancelUsage(
    actor: Actor,
    usageId: string,
    body: CancelSupplyUsageDto,
  ): Promise<SupplyItemResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const itemId = await this.dataSource.transaction(async (manager) => {
      const usageRows = await manager.find(SupplyStockMovementEntity, {
        where: { usageId, type: SupplyStockMovementType.USAGE },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      if (usageRows.length === 0) {
        throw new NotFoundException('Không tìm thấy lần xuất');
      }
      const item = await this.stock.lockItem(manager, usageRows[0].itemId);
      assertUsageNotCancelled(
        await manager.exists(SupplyStockMovementEntity, {
          where: { usageId, type: SupplyStockMovementType.USAGE_REVERSAL },
        }),
      );
      assertUsageCancellable(
        caller.id,
        caller.role,
        { usedBy: usageRows[0].createdBy, usedAt: usageRows[0].createdAt },
        new Date(),
      );
      const before = Number(item.quantityOnHand);
      const saved = await this.stock.reverseUsage(
        manager,
        item,
        usageRows,
        caller.id,
        body.reason,
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.SUPPLY_ITEM,
        entityId: item.id,
        before: { quantityOnHand: before },
        after: {
          quantityOnHand: Number(saved.quantityOnHand),
          cancelledUsageId: usageId,
          lots: usageRows.map((row) => ({
            lotId: row.lotId,
            quantity: -Number(row.delta),
          })),
        },
        reason: body.reason,
        feature: AuditFeature.SUPPLY_STOCK,
      });
      return item.id;
    });
    return this.get(actor, itemId);
  }

  /**
   * Liệt kê các lô của một vật tư theo thứ tự nhập, lô nhập sớm nhất trước
   *
   * - Vật tư đã xóa vẫn xem được lô
   * - Lô đã hết hàng vẫn hiện với số còn 0
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @returns Promise trả về các lô của vật tư
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư
   */
  async lotsOf(actor: Actor, id: string): Promise<SupplyLotResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const exists = await this.items.exists({
      where: { id },
      withDeleted: true,
    });
    if (!exists) throw new NotFoundException(SUPPLY_ITEM_NOT_FOUND);
    const rows = await this.lots.find({
      where: { itemId: id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map(toSupplyLotResponse);
  }
}

/**
 * Lấy các field của vật tư được ghi nhật ký khi sửa, số đã đổi sang number
 *
 * @param item Vật tư
 * @returns Tên, loại, đơn vị, ngưỡng báo thiếu
 */
function auditedItemFields(item: SupplyItemEntity) {
  return {
    name: item.name,
    category: item.category,
    unit: item.unit,
    reorderThreshold: Number(item.reorderThreshold),
  };
}
