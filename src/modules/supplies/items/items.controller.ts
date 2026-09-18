import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
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
  items() {
    return this.pending();
  }

  @Get('items/low-stock')
  @ApiOperation({
    summary: 'List items at or below reorder threshold',
    operationId: 'SuppliesController_lowStock',
  })
  lowStock() {
    return this.pending();
  }

  @Post('items')
  @ApiOperation({
    summary: 'Create supply item',
    operationId: 'SuppliesController_createItem',
  })
  createItem(@Body() _body: CreateSupplyItemDto) {
    return this.pending();
  }

  @Get('items/:id')
  @ApiOperation({
    summary: 'Get supply item',
    operationId: 'SuppliesController_item',
  })
  item(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('items/:id')
  @ApiOperation({
    summary: 'Update supply quantity or threshold',
    operationId: 'SuppliesController_updateItem',
  })
  updateItem(@Param('id') _id: string, @Body() _body: UpdateSupplyItemDto) {
    return this.pending();
  }

  @Delete('items/:id')
  @ApiOperation({
    summary: 'Soft-delete supply item',
    operationId: 'SuppliesController_deleteItem',
  })
  deleteItem(@Param('id') _id: string) {
    return this.pending();
  }
}
