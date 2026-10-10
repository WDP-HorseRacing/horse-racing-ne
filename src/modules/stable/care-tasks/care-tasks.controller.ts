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
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  CareTaskTypeResponseDto,
  CreateCareTaskTypeDto,
  CreateHorseCareTaskDto,
  HorseCareTaskResponseDto,
  UpdateCareTaskTypeDto,
} from '../dto/care-task.dto';
import { CareTasksService } from './care-tasks.service';

const TYPE_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class CareTasksController {
  constructor(private readonly careTasks: CareTasksService) {}

  @Access(TYPE_READERS)
  @Get('care-task-types')
  @ApiOperation({ summary: 'Liệt kê danh mục loại việc chăm sóc' })
  @ApiOkResponse({ type: [CareTaskTypeResponseDto] })
  listTypes() {
    return this.careTasks.listTypes();
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('care-task-types')
  @ApiOperation({ summary: 'Thêm loại việc chăm sóc' })
  @ApiCreatedResponse({ type: CareTaskTypeResponseDto })
  createType(@CurrentUser() actor: Actor, @Body() body: CreateCareTaskTypeDto) {
    return this.careTasks.createType(actor, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('care-task-types/:id')
  @ApiOperation({ summary: 'Sửa, ngưng hoặc dùng lại loại việc chăm sóc' })
  @ApiOkResponse({ type: CareTaskTypeResponseDto })
  updateType(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCareTaskTypeDto,
  ) {
    return this.careTasks.updateType(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.GROOM])
  @Get('horses/:horseId/care-tasks')
  @ApiOperation({ summary: 'Liệt kê việc riêng của ngựa' })
  @ApiOkResponse({ type: [HorseCareTaskResponseDto] })
  listForHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ) {
    return this.careTasks.listForHorse(actor, horseId);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('horses/:horseId/care-tasks')
  @ApiOperation({ summary: 'Gắn việc riêng cho ngựa trong khoảng ngày' })
  @ApiCreatedResponse({ type: HorseCareTaskResponseDto })
  createForHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateHorseCareTaskDto,
  ) {
    return this.careTasks.createForHorse(actor, horseId, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Delete('horse-care-tasks/:id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Gỡ việc riêng: chưa bắt đầu thì xóa, đang chạy thì kết thúc hôm nay',
  })
  @ApiNoContentResponse()
  removeForHorse(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.careTasks.removeForHorse(actor, id);
  }
}
