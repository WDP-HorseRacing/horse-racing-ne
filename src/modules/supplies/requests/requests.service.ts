import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { fieldBadRequest } from '../../../common/utils/field-errors';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CreateSupplyRequestDto,
  EditSupplyRequestDto,
  SupplyRequestListQueryDto,
  SupplyRequestPageResponseDto,
  SupplyRequestResponseDto,
  UpdateSupplyRequestStatusDto,
} from '../dto/supply-request.dto';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { toSupplyRequestResponse } from '../mappers/supply-request.mapper';
import {
  assertCanViewSupplyRequest,
  assertSupplyRequestEditable,
  assertSupplyRequestTransition,
  supplyRequestStatusReason,
} from '../policies/supplies.policy';
import { SupplyStockService } from '../shared/supply-stock.service';
import {
  SUPPLY_REQUEST_CREATED_EVENT,
  SUPPLY_REQUEST_STATUS_CHANGED_EVENT,
} from '../constants/supply-events.constants';
import type {
  SupplyRequestCreatedEvent,
  SupplyRequestStatusChangedEvent,
} from '../types/supply-events.types';

const REQUEST_RELATIONS = {
  item: true,
  requester: true,
  reviewer: true,
  fulfiller: true,
  canceller: true,
} as const;

const SUPPLY_REQUEST_NOT_FOUND = 'Không tìm thấy đề xuất bổ sung vật tư';

/**
 * Đề xuất bổ sung vật tư: Groom, Head Trainer, Veterinarian gửi; Club Manager duyệt, từ chối, cấp, hủy
 */
@Injectable()
export class SupplyRequestsService {
  constructor(
    @InjectRepository(SupplyRequestEntity)
    private readonly requests: Repository<SupplyRequestEntity>,
    private readonly stock: SupplyStockService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Liệt kê đề xuất, mới nhất trước
   *
   * - Club Manager: mọi đề xuất
   * - Vai trò khác: đề xuất của chính mình
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Lọc trạng thái và phân trang
   * @returns Promise trả về một trang đề xuất
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   */
  async list(
    actor: Actor,
    query: SupplyRequestListQueryDto,
  ): Promise<SupplyRequestPageResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const [rows, total] = await this.requests.findAndCount({
      where: {
        ...(caller.role === UserRole.CLUB_MANAGER
          ? {}
          : { requestedBy: caller.id }),
        ...(query.status ? { status: query.status } : {}),
      },
      relations: REQUEST_RELATIONS,
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return new PaginationResponseDto(
      rows.map(toSupplyRequestResponse),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Gửi đề xuất bổ sung cho một vật tư chưa xóa
   *
   * - Chưa có số lượng, Club Manager nhập số lượng thực nhận khi cấp
   * - Ghi nhật ký kèm vật tư, ghi chú, trạng thái
   * - Ghi SUPPLY_REQUEST_CREATED_EVENT vào outbox để báo Club Manager
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Vật tư, ghi chú
   * @returns Promise trả về đề xuất vừa gửi, trạng thái PENDING
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  async create(
    actor: Actor,
    body: CreateSupplyRequestDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const created = await this.dataSource.transaction(async (manager) => {
      const item = await this.stock.lockItem(manager, body.itemId);
      const saved = await manager.save(
        manager.create(SupplyRequestEntity, {
          itemId: body.itemId,
          requestedBy: caller.id,
          quantity: null,
          status: SupplyRequestStatus.PENDING,
          note: body.note?.trim() || null,
        }),
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.SUPPLY_REQUEST,
        entityId: saved.id,
        before: null,
        after: {
          itemId: saved.itemId,
          note: saved.note,
          status: saved.status,
        },
        feature: AuditFeature.SUPPLY_REQUEST,
      });
      const event: SupplyRequestCreatedEvent = {
        eventId: saved.id,
        requestId: saved.id,
        itemName: item.name,
        unit: item.unit,
        requesterName: caller.fullName,
      };
      await this.events.publish(manager, SUPPLY_REQUEST_CREATED_EVENT, event);
      return this.findWithRelations(manager, saved.id);
    });
    return toSupplyRequestResponse(created);
  }

  /**
   * Lấy một đề xuất
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của đề xuất
   * @returns Promise trả về đề xuất
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc đề xuất không phải của người gọi (trừ Club Manager)
   * @throws NotFoundException Nếu không có đề xuất
   */
  async get(actor: Actor, id: string): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const request = await this.findWithRelations(this.dataSource.manager, id);
    assertCanViewSupplyRequest(caller.id, caller.role, request.requestedBy);
    return toSupplyRequestResponse(request);
  }

  /**
   * Người gửi sửa ghi chú của đề xuất còn chờ duyệt
   *
   * - Ghi chú đổi giá trị: ghi nhật ký giá trị trước và sau
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của đề xuất
   * @param body Ghi chú mới, không gửi thì giữ ghi chú cũ
   * @returns Promise trả về đề xuất sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc người gọi không phải người gửi
   * @throws NotFoundException Nếu không có đề xuất
   * @throws ConflictException Nếu đề xuất không còn PENDING
   */
  async edit(
    actor: Actor,
    id: string,
    body: EditSupplyRequestDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const updated = await this.dataSource.transaction(async (manager) => {
      const request = await this.findLocked(manager, id);
      assertSupplyRequestEditable(
        caller.id,
        request.requestedBy,
        request.status,
      );
      const before = { note: request.note };
      if (body.note !== undefined) {
        request.note = body.note.trim() || null;
      }
      await manager.save(request);
      const diff = changedFieldsDiff(before, { note: request.note });
      if (diff) {
        await this.auditService.record(manager, {
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.SUPPLY_REQUEST,
          entityId: request.id,
          ...diff,
          feature: AuditFeature.SUPPLY_REQUEST,
        });
      }
      return this.findWithRelations(manager, request.id);
    });
    return toSupplyRequestResponse(updated);
  }

  /**
   * Club Manager duyệt, từ chối, cấp hoặc hủy đề xuất
   *
   * - REJECTED: bắt buộc lý do, lý do ghi kèm nhật ký
   * - CANCELLED: bắt buộc lý do; lưu người hủy, lúc hủy, lý do hủy; lý do ghi kèm nhật ký
   * - FULFILLED: bắt buộc số lượng thực nhận và đơn giá; cộng số lượng đó vào tồn, lưu vào đề xuất và ghi dòng sổ RESTOCK kèm đơn giá; nhật ký ghi kèm số lượng và đơn giá
   * - Ghi nhật ký trạng thái trước và sau
   * - Ghi SUPPLY_REQUEST_STATUS_CHANGED_EVENT vào outbox để báo người gửi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của đề xuất
   * @param body Trạng thái mới, lý do từ chối hoặc hủy, số lượng thực nhận và đơn giá khi cấp
   * @returns Promise trả về đề xuất sau khi đổi trạng thái
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có đề xuất, hoặc vật tư đã xóa khi cấp
   * @throws ConflictException Nếu chuyển trạng thái sai thứ tự
   * @throws BadRequestException Nếu từ chối hoặc hủy mà lý do rỗng, hoặc cấp hàng mà thiếu số lượng thực nhận hoặc đơn giá
   */
  async updateStatus(
    actor: Actor,
    id: string,
    body: UpdateSupplyRequestStatusDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const updated = await this.dataSource.transaction(async (manager) => {
      if (body.status === SupplyRequestStatus.FULFILLED) {
        await this.lockRequestItem(manager, id);
      }
      const request = await this.findLocked(manager, id);
      const previousStatus = request.status;
      assertSupplyRequestTransition(request.status, body.status);
      const now = new Date();
      const reason = supplyRequestStatusReason(
        body.status,
        body.reason?.trim() || null,
      );
      if (body.status === SupplyRequestStatus.FULFILLED) {
        if (body.quantity === undefined) {
          throw fieldBadRequest(
            'quantity',
            'Phải nhập số lượng thực nhận khi cấp hàng',
          );
        }
        if (body.unitPrice === undefined) {
          throw fieldBadRequest('unitPrice', 'Phải nhập đơn giá khi cấp hàng');
        }
        request.quantity = body.quantity.toString();
        await this.stock.restock(manager, request.itemId, {
          quantity: request.quantity,
          unitPrice: String(body.unitPrice),
          actorId: caller.id,
          requestId: request.id,
          note: null,
        });
        request.fulfilledBy = caller.id;
        request.fulfilledAt = now;
      } else if (body.status === SupplyRequestStatus.CANCELLED) {
        request.cancelledBy = caller.id;
        request.cancelledAt = now;
        request.cancellationReason = reason;
      } else {
        request.reviewedBy = caller.id;
        request.reviewedAt = now;
        request.rejectionReason = reason;
      }
      request.status = body.status;
      await manager.save(request);
      const fulfilled = body.status === SupplyRequestStatus.FULFILLED;
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.SUPPLY_REQUEST,
        entityId: request.id,
        before: { status: previousStatus },
        after: {
          status: request.status,
          ...(fulfilled && {
            quantity: Number(request.quantity),
            unitPrice: body.unitPrice,
          }),
        },
        reason,
        feature: AuditFeature.SUPPLY_REQUEST,
      });
      const result = await this.findWithRelations(manager, request.id);
      const event: SupplyRequestStatusChangedEvent = {
        eventId: deterministicUuid(
          `supply-request:${request.id}:${request.status}`,
        ),
        requestId: request.id,
        requesterId: request.requestedBy,
        itemName: result.item.name,
        unit: result.item.unit,
        quantity: fulfilled ? Number(request.quantity) : null,
        status: request.status,
        reason,
      };
      await this.events.publish(
        manager,
        SUPPLY_REQUEST_STATUS_CHANGED_EVENT,
        event,
      );
      return result;
    });
    return toSupplyRequestResponse(updated);
  }

  /**
   * Đọc đề xuất kèm vật tư (kể cả đã xóa) và người liên quan
   *
   * @param manager EntityManager dùng để query
   * @param id UUID của đề xuất
   * @returns Promise trả về đề xuất đủ quan hệ để map
   * @throws NotFoundException Nếu không có đề xuất
   */
  private async findWithRelations(
    manager: EntityManager,
    id: string,
  ): Promise<SupplyRequestEntity> {
    const request = await manager.findOne(SupplyRequestEntity, {
      where: { id },
      relations: REQUEST_RELATIONS,
      withDeleted: true,
    });
    if (!request) throw new NotFoundException(SUPPLY_REQUEST_NOT_FOUND);
    return request;
  }

  /**
   * Khóa row vật tư của một đề xuất (pessimistic_write, kể cả vật tư đã xóa) trước khi khóa đề xuất
   *
   * - Không ném lỗi: không có đề xuất thì bỏ qua; nơi gọi tự kiểm đề xuất và vật tư sau đó
   *
   * @param manager EntityManager của transaction đang chạy
   * @param id UUID của đề xuất
   * @returns Promise hoàn tất khi đã khóa
   */
  private async lockRequestItem(
    manager: EntityManager,
    id: string,
  ): Promise<void> {
    const request = await manager.findOne(SupplyRequestEntity, {
      select: { id: true, itemId: true },
      where: { id },
    });
    if (!request) return;
    await manager.find(SupplyItemEntity, {
      select: { id: true },
      where: { id: request.itemId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Khóa row đề xuất để đổi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param id UUID của đề xuất
   * @returns Promise trả về đề xuất đã khóa
   * @throws NotFoundException Nếu không có đề xuất
   */
  private async findLocked(
    manager: EntityManager,
    id: string,
  ): Promise<SupplyRequestEntity> {
    const request = await manager.findOne(SupplyRequestEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw new NotFoundException(SUPPLY_REQUEST_NOT_FOUND);
    return request;
  }
}
