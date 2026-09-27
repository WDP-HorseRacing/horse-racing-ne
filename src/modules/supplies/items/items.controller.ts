import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import {
  CreateSupplyItemDto,
  UpdateSupplyItemDto,
} from '../dto/supply-item.dto';

@ApiTags('supplies')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('supplies')
export class SupplyItemsController extends PendingApi {
  @Get('items')
  @ApiOperation({
    summary: 'List club supply inventory',
    operationId: 'SuppliesController_items',
  })
  items(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Get('items/low-stock')
  @ApiOperation({
    summary: 'List items at or below reorder threshold',
    operationId: 'SuppliesController_lowStock',
  })
  lowStock(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Post('items')
  @ApiOperation({
    summary: 'Create supply item',
    operationId: 'SuppliesController_createItem',
  })
  createItem(@CurrentUser() _actor: Actor, @Body() _body: CreateSupplyItemDto) {
    return this.pending();
  }

  @Get('items/:id')
  @ApiOperation({
    summary: 'Get supply item',
    operationId: 'SuppliesController_item',
  })
  item(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }

  @Patch('items/:id')
  @ApiOperation({
    summary: 'Update supply quantity or threshold',
    operationId: 'SuppliesController_updateItem',
  })
  updateItem(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpdateSupplyItemDto,
  ) {
    return this.pending();
  }

  @Delete('items/:id')
  @ApiOperation({
    summary: 'Soft-delete supply item',
    operationId: 'SuppliesController_deleteItem',
  })
  deleteItem(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }
}
