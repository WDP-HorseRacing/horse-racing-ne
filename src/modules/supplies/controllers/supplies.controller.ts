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
import { CreateSupplyItemDto } from '../dto/create-supply-item.dto';
import { CreateSupplyRequestDto } from '../dto/create-supply-request.dto';
import { UpdateSupplyItemDto } from '../dto/update-supply-item.dto';
import { UpdateSupplyRequestDto } from '../dto/update-supply-request.dto';

@ApiTags('supplies')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('supplies')
export class SuppliesController extends PendingApi {
  @Get('items')
  @ApiOperation({ summary: 'List club supply inventory' })
  items() {
    return this.pending();
  }

  @Get('items/low-stock')
  @ApiOperation({ summary: 'List items at or below reorder threshold' })
  lowStock() {
    return this.pending();
  }

  @Post('items')
  @ApiOperation({ summary: 'Create supply item' })
  createItem(@Body() _body: CreateSupplyItemDto) {
    return this.pending();
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get supply item' })
  item(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update supply quantity or threshold' })
  updateItem(@Param('id') _id: string, @Body() _body: UpdateSupplyItemDto) {
    return this.pending();
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Soft-delete supply item' })
  deleteItem(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('requests')
  @ApiOperation({ summary: 'List supply requests' })
  requests() {
    return this.pending();
  }

  @Post('requests')
  @ApiOperation({ summary: 'Request supply replenishment' })
  createRequest(@Body() _body: CreateSupplyRequestDto) {
    return this.pending();
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get supply request' })
  request(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('requests/:id/status')
  @ApiOperation({ summary: 'Approve, reject or fulfill supply request' })
  updateRequest(
    @Param('id') _id: string,
    @Body() _body: UpdateSupplyRequestDto,
  ) {
    return this.pending();
  }
}
