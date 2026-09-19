import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  CreateSupplyItemDto,
  SupplyItemResponseDto,
  UpdateSupplyItemDto,
} from '../dto/supply-item.dto';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { toSupplyItemResponse } from '../mappers/supply-item.mapper';

@Injectable()
export class SupplyItemsService {
  constructor(
    @InjectRepository(SupplyItemEntity)
    private readonly itemRepository: Repository<SupplyItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(actor: Actor): Promise<SupplyItemResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const items = await this.itemRepository.find({ order: { name: 'ASC' } });
    return items.map(toSupplyItemResponse);
  }

  async lowStock(actor: Actor): Promise<SupplyItemResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const items = await this.itemRepository
      .createQueryBuilder('item')
      .where('item.quantity_on_hand <= item.reorder_threshold')
      .orderBy('item.name', 'ASC')
      .getMany();
    return items.map(toSupplyItemResponse);
  }

  async get(actor: Actor, id: string): Promise<SupplyItemResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const item = await this.itemRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    return toSupplyItemResponse(item);
  }

  async create(
    actor: Actor,
    body: CreateSupplyItemDto,
  ): Promise<SupplyItemResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const item = this.itemRepository.create({
      name: body.name.trim(),
      category: body.category,
      unit: body.unit.trim(),
      quantityOnHand: body.quantityOnHand.toString(),
      reorderThreshold: body.reorderThreshold.toString(),
    });

    const saved = await this.saveUnique(() => this.itemRepository.save(item));
    return toSupplyItemResponse(saved);
  }

  async update(
    actor: Actor,
    id: string,
    body: UpdateSupplyItemDto,
  ): Promise<SupplyItemResponseDto> {
    await currentUserForActor(this.dataSource.manager, actor);

    const item = await this.itemRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');

    Object.assign(
      item,
      Object.fromEntries(
        Object.entries({
          name: body.name?.trim(),
          category: body.category,
          unit: body.unit?.trim(),
          quantityOnHand:
            body.quantityOnHand !== undefined
              ? body.quantityOnHand.toString()
              : undefined,
          reorderThreshold:
            body.reorderThreshold !== undefined
              ? body.reorderThreshold.toString()
              : undefined,
        }).filter(([, value]) => value !== undefined),
      ),
    );

    const saved = await this.saveUnique(() => this.itemRepository.save(item));
    return toSupplyItemResponse(saved);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await currentUserForActor(this.dataSource.manager, actor);
    const item = await this.itemRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('Không tìm thấy vật tư');
    await this.itemRepository.softDelete({ id });
  }

  private async saveUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException('Tên vật tư đã tồn tại');
      }
      throw error;
    }
  }
}
