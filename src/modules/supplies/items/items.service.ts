import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import type { Actor } from '../../../common/types/actor';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CreateSupplyItemDto,
  SupplyItemListQueryDto,
  SupplyItemPageResponseDto,
  SupplyItemResponseDto,
  SupplyStockCountDto,
  SupplyStockMovementPageResponseDto,
  UpdateSupplyItemDto,
} from '../dto/supply-item.dto';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyRequestEntity } from '../entities/supply-request.entity';
import { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import {
  toSupplyItemResponse,
  toSupplyStockMovementResponse,
} from '../mappers/supply-item.mapper';
import {
  SUPPLY_ITEM_NOT_FOUND,
  SupplyStockService,
} from '../shared/supply-stock.service';

const SUPPLY_ITEM_NAME_TAKEN = 'Tên vật tư đã tồn tại';
const ITEM_RELATIONS = { lastCounter: true } as const;

/**
 * Danh mục vật tư của kho chung CLB: thêm, sửa, xóa, kiểm kê và sổ nhập xuất
 */
@Injectable()
export class SupplyItemsService {
  constructor(
    @InjectRepository(SupplyItemEntity)
    private readonly items: Repository<SupplyItemEntity>,
    @InjectRepository(SupplyStockMovementEntity)
    private readonly movements: Repository<SupplyStockMovementEntity>,
    private readonly stock: SupplyStockService,
    private readonly dataSource: DataSource,
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
        ...(search ? { name: ILike(`%${search}%`) } : {}),
      },
      relations: ITEM_RELATIONS,
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
      .leftJoinAndSelect('item.lastCounter', 'lastCounter')
      .where('item.deletedAt IS NULL')
      .andWhere('item.quantityOnHand <= item.reorderThreshold')
      .orderBy('item.name', 'ASC')
      .getMany();
    return rows.map(toSupplyItemResponse);
  }

  /**
   * Thêm vật tư; số tồn ban đầu khác 0 thì ghi một dòng sổ kiểm kê
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Tên, loại, đơn vị, số tồn ban đầu, ngưỡng báo thiếu
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
          if (body.quantityOnHand) {
            await this.stock.recordCount(
              manager,
              item,
              body.quantityOnHand.toString(),
              caller.id,
              null,
            );
          }
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
      relations: ITEM_RELATIONS,
      withDeleted: true,
    });
    if (!row) throw new NotFoundException(SUPPLY_ITEM_NOT_FOUND);
    return toSupplyItemResponse(row);
  }

  /**
   * Sửa tên, loại, đơn vị, ngưỡng báo thiếu; không đổi số tồn
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
    await currentUserForActor(this.dataSource.manager, actor);
    await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const item = await this.stock.lockItem(manager, id);
          Object.assign(item, {
            name: body.name?.trim() ?? item.name,
            category: body.category ?? item.category,
            unit: body.unit?.trim() ?? item.unit,
            reorderThreshold:
              body.reorderThreshold?.toString() ?? item.reorderThreshold,
          });
          await manager.save(item);
        }),
      SUPPLY_ITEM_NAME_TAKEN,
    );
    return this.get(actor, id);
  }

  /**
   * Xóa mềm vật tư; đề xuất và sổ nhập xuất cũ vẫn giữ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   * @throws ConflictException Nếu vật tư còn đề xuất PENDING hoặc APPROVED
   */
  async remove(actor: Actor, id: string): Promise<void> {
    await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      await this.stock.lockItem(manager, id);
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
    });
  }

  /**
   * Kiểm kê: ghi số đếm thực tế, phần chênh lệch vào sổ nhập xuất
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của vật tư
   * @param body Số đếm thực tế và ghi chú
   * @returns Promise trả về vật tư sau khi kiểm kê
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  async count(
    actor: Actor,
    id: string,
    body: SupplyStockCountDto,
  ): Promise<SupplyItemResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const item = await this.stock.lockItem(manager, id);
      await this.stock.recordCount(
        manager,
        item,
        body.quantityOnHand.toString(),
        caller.id,
        body.note?.trim() || null,
      );
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
      relations: { creator: true },
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return new PaginationResponseDto(
      rows.map(toSupplyStockMovementResponse),
      total,
      query.page,
      query.limit,
    );
  }
}
