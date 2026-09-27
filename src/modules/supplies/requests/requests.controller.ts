import {
  Body,
  Controller,
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
  CreateSupplyRequestDto,
  EditSupplyRequestDto,
  UpdateSupplyRequestStatusDto,
} from '../dto/supply-request.dto';

@ApiTags('supplies')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('supplies')
export class SupplyRequestsController extends PendingApi {
  @Get('requests')
  @ApiOperation({
    summary: 'List supply requests',
    operationId: 'SuppliesController_requests',
  })
  requests(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Post('requests')
  @ApiOperation({
    summary: 'Request supply replenishment',
    operationId: 'SuppliesController_createRequest',
  })
  createRequest(
    @CurrentUser() _actor: Actor,
    @Body() _body: CreateSupplyRequestDto,
  ) {
    return this.pending();
  }

  @Get('requests/:id')
  @ApiOperation({
    summary: 'Get supply request',
    operationId: 'SuppliesController_request',
  })
  request(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Patch('requests/:id')
  @ApiOperation({
    summary: 'Update a pending supply request',
    operationId: 'SuppliesController_editRequest',
  })
  editRequest(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: EditSupplyRequestDto,
  ) {
    return this.pending();
  }

  @Patch('requests/:id/status')
  @ApiOperation({
    summary: 'Approve, reject or fulfill supply request',
    operationId: 'SuppliesController_updateRequest',
  })
  updateRequestStatus(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpdateSupplyRequestStatusDto,
  ) {
    return this.pending();
  }
}
