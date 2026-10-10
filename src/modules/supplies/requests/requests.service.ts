import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CreateSupplyRequestDto,
  EditSupplyRequestDto,
  SupplyRequestListQueryDto,
  SupplyRequestPageResponseDto,
  SupplyRequestResponseDto,
  UpdateSupplyRequestStatusDto,
} from '../dto/supply-request.dto';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { toSupplyRequestResponse } from '../mappers/supply-request.mapper';
import {
  assertCanViewSupplyRequest,
  assertRejectionReason,
  assertSupplyRequestEditable,
  assertSupplyRequestTransition,
} from '../policies/supplies.policy';
import { SupplyStockService } from '../shared/supply-stock.service';

const REQUEST_RELATIONS = {
  item: { lastCounter: true },
  requester: true,
  reviewer: true,
  fulfiller: true,
} as const;

const SUPPLY_REQUEST_NOT_FOUND = 'Không tìm thấy đề xuất bổ sung vật tư';

/**
 * Đề xuất bổ sung vật tư: Groom, Head Trainer gửi; Club Manager duyệt, từ chối, cấp
 */
@Injectable()
export class SupplyRequestsService {
  constructor(
    @InjectRepository(SupplyRequestEntity)
    private readonly requests: Repository<SupplyRequestEntity>,
    private readonly stock: SupplyStockService,
    private readonly dataSource: DataSource,
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
   * @param actor Thông tin danh tính từ Access Token
   * @param body Vật tư, số lượng, ghi chú
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
      await this.stock.lockItem(manager, body.itemId);
      const saved = await manager.save(
        manager.create(SupplyRequestEntity, {
          itemId: body.itemId,
          requestedBy: caller.id,
          quantity: body.quantity.toString(),
          status: SupplyRequestStatus.PENDING,
          note: body.note?.trim() || null,
        }),
      );
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
   * Người gửi sửa số lượng, ghi chú của đề xuất còn chờ duyệt
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của đề xuất
   * @param body Các field cần sửa, field không gửi giữ giá trị cũ
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
      if (body.quantity !== undefined) {
        request.quantity = body.quantity.toString();
      }
      if (body.note !== undefined) {
        request.note = body.note.trim() || null;
      }
      await manager.save(request);
      return this.findWithRelations(manager, request.id);
    });
    return toSupplyRequestResponse(updated);
  }

  /**
   * Club Manager duyệt, từ chối hoặc cấp đề xuất
   *
   * - REJECTED: bắt buộc lý do
   * - FULFILLED: cộng số lượng đề xuất vào tồn và ghi dòng sổ RESTOCK
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của đề xuất
   * @param body Trạng thái mới và lý do từ chối
   * @returns Promise trả về đề xuất sau khi đổi trạng thái
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có đề xuất, hoặc vật tư đã xóa khi cấp
   * @throws ConflictException Nếu chuyển trạng thái sai thứ tự
   * @throws BadRequestException Nếu từ chối mà lý do rỗng
   */
  async updateStatus(
    actor: Actor,
    id: string,
    body: UpdateSupplyRequestStatusDto,
  ): Promise<SupplyRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const updated = await this.dataSource.transaction(async (manager) => {
      const request = await this.findLocked(manager, id);
      assertSupplyRequestTransition(request.status, body.status);
      const now = new Date();
      if (body.status === SupplyRequestStatus.FULFILLED) {
        await this.stock.restock(
          manager,
          request.itemId,
          request.quantity,
          request.id,
          caller.id,
        );
        request.fulfilledBy = caller.id;
        request.fulfilledAt = now;
      } else {
        const reason = body.reason?.trim() || null;
        assertRejectionReason(body.status, reason);
        request.reviewedBy = caller.id;
        request.reviewedAt = now;
        request.rejectionReason =
          body.status === SupplyRequestStatus.REJECTED ? reason : null;
      }
      request.status = body.status;
      await manager.save(request);
      return this.findWithRelations(manager, request.id);
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
