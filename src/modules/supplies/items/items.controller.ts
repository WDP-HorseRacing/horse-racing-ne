import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  CreateSupplyItemDto,
  SupplyItemListQueryDto,
  SupplyItemPageResponseDto,
  SupplyItemResponseDto,
  SupplyStockCountDto,
  SupplyStockMovementPageResponseDto,
  UpdateSupplyItemDto,
} from '../dto/supply-item.dto';
import { SupplyItemsService } from './items.service';

const ITEM_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('supplies')
@ApiBearerAuth()
@Controller('supplies')
export class SupplyItemsController {
  constructor(private readonly items: SupplyItemsService) {}

  @Access(ITEM_READERS)
  @Get('items')
  @ApiOperation({
    summary: 'Liệt kê vật tư của kho chung',
    operationId: 'SuppliesController_items',
  })
  @ApiOkResponse({ type: SupplyItemPageResponseDto })
  list(@CurrentUser() actor: Actor, @Query() query: SupplyItemListQueryDto) {
    return this.items.list(actor, query);
  }

  @Access(ITEM_READERS)
  @Get('items/low-stock')
  @ApiOperation({
    summary: 'Liệt kê vật tư sắp hết',
    operationId: 'SuppliesController_lowStock',
  })
  @ApiOkResponse({ type: [SupplyItemResponseDto] })
  lowStock(@CurrentUser() actor: Actor) {
    return this.items.lowStock(actor);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('items')
  @ApiOperation({
    summary: 'Thêm vật tư',
    operationId: 'SuppliesController_createItem',
  })
  @ApiCreatedResponse({ type: SupplyItemResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: CreateSupplyItemDto) {
    return this.items.create(actor, body);
  }

  @Access(ITEM_READERS)
  @Get('items/:id')
  @ApiOperation({
    summary: 'Xem một vật tư',
    operationId: 'SuppliesController_item',
  })
  @ApiOkResponse({ type: SupplyItemResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.items.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('items/:id')
  @ApiOperation({
    summary: 'Sửa tên, loại, đơn vị, ngưỡng báo thiếu của vật tư',
    operationId: 'SuppliesController_updateItem',
  })
  @ApiOkResponse({ type: SupplyItemResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplyItemDto,
  ) {
    return this.items.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete('items/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Xóa mềm vật tư',
    operationId: 'SuppliesController_deleteItem',
  })
  @ApiNoContentResponse()
  remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.items.remove(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.GROOM])
  @Post('items/:id/stock-counts')
  @ApiOperation({ summary: 'Kiểm kê: ghi số đếm thực tế của vật tư' })
  @ApiCreatedResponse({ type: SupplyItemResponseDto })
  count(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupplyStockCountDto,
  ) {
    return this.items.count(actor, id, body);
  }

  @Access(ITEM_READERS)
  @Get('items/:id/movements')
  @ApiOperation({ summary: 'Sổ nhập xuất của vật tư, mới nhất trước' })
  @ApiOkResponse({ type: SupplyStockMovementPageResponseDto })
  movements(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.items.movementsOf(actor, id, query);
  }
}
