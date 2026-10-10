import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  CreateSupplyRequestDto,
  EditSupplyRequestDto,
  SupplyRequestListQueryDto,
  SupplyRequestPageResponseDto,
  SupplyRequestResponseDto,
  UpdateSupplyRequestStatusDto,
} from '../dto/supply-request.dto';
import { SupplyRequestsService } from './requests.service';

const REQUEST_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.GROOM,
];
const REQUESTERS = [UserRole.HEAD_TRAINER, UserRole.GROOM];

@ApiTags('supplies')
@ApiBearerAuth()
@Controller('supplies')
export class SupplyRequestsController {
  constructor(private readonly requests: SupplyRequestsService) {}

  @Access(REQUEST_READERS)
  @Get('requests')
  @ApiOperation({
    summary: 'Liệt kê đề xuất bổ sung vật tư',
    operationId: 'SuppliesController_requests',
  })
  @ApiOkResponse({ type: SupplyRequestPageResponseDto })
  list(@CurrentUser() actor: Actor, @Query() query: SupplyRequestListQueryDto) {
    return this.requests.list(actor, query);
  }

  @Access(REQUESTERS)
  @Post('requests')
  @ApiOperation({
    summary: 'Gửi đề xuất bổ sung vật tư',
    operationId: 'SuppliesController_createRequest',
  })
  @ApiCreatedResponse({ type: SupplyRequestResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: CreateSupplyRequestDto) {
    return this.requests.create(actor, body);
  }

  @Access(REQUEST_READERS)
  @Get('requests/:id')
  @ApiOperation({
    summary: 'Xem một đề xuất bổ sung vật tư',
    operationId: 'SuppliesController_request',
  })
  @ApiOkResponse({ type: SupplyRequestResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(actor, id);
  }

  @Access(REQUESTERS)
  @Patch('requests/:id')
  @ApiOperation({
    summary: 'Sửa đề xuất đang chờ duyệt của mình',
    operationId: 'SuppliesController_editRequest',
  })
  @ApiOkResponse({ type: SupplyRequestResponseDto })
  edit(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EditSupplyRequestDto,
  ) {
    return this.requests.edit(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('requests/:id/status')
  @ApiOperation({
    summary: 'Duyệt, từ chối hoặc cấp đề xuất bổ sung vật tư',
    operationId: 'SuppliesController_updateRequest',
  })
  @ApiOkResponse({ type: SupplyRequestResponseDto })
  updateStatus(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplyRequestStatusDto,
  ) {
    return this.requests.updateStatus(actor, id, body);
  }
}
