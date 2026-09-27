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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CancelCareScheduleDto,
  CareScheduleResponseDto,
  CompleteCareScheduleDto,
  CompleteCareScheduleResponseDto,
  CreateCareScheduleDto,
  UpdateCareScheduleDto,
} from '../dto';
import { CareSchedulesService } from './care-schedules.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class CareSchedulesController {
  constructor(private readonly careSchedules: CareSchedulesService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
    UserRole.GROOM,
  ])
  @Get('horses/:horseId/care-schedules')
  @ApiOperation({
    summary: 'List vaccination, deworming and farrier schedules (F3.11)',
    description: 'Groom chỉ thấy lịch được giao cho mình.',
    operationId: 'MedicalDetailsController_careSchedules',
  })
  @ApiOkResponse({ type: [CareScheduleResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<CareScheduleResponseDto[]> {
    return this.careSchedules.list(actor, horseId);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('horses/:horseId/care-schedules')
  @ApiOperation({
    summary: 'Create a care schedule (F3.11)',
    description:
      'Ngày đến hạn ở quá khứ hoặc người được giao không phải VET/Groom đang hoạt động: 400. Ngựa đã chuyển nhượng: 409.',
    operationId: 'MedicalDetailsController_createCareSchedule',
  })
  @ApiCreatedResponse({ type: CareScheduleResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    return this.careSchedules.create(actor, horseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Patch('care-schedules/:id')
  @ApiOperation({
    summary: 'Reschedule or reassign a care schedule (F3.11)',
    description: 'Dời ngày bắt buộc reason. Lịch đã hoàn tất/đã hủy: 409.',
    operationId: 'MedicalDetailsController_updateCareSchedule',
  })
  @ApiOkResponse({ type: CareScheduleResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    return this.careSchedules.update(actor, id, body);
  }

  @Access([UserRole.VETERINARIAN, UserRole.GROOM])
  @Post('care-schedules/:id/complete')
  @ApiOperation({
    summary: 'Complete a care schedule (F3.11)',
    description:
      'Veterinarian, hoặc đúng Groom được giao mà vẫn phụ trách ngựa; người khác 403. Chỉ Veterinarian được nhập nextDueAt để tạo luôn lịch lần tới. Lịch đã hoàn tất/đã hủy: 409.',
    operationId: 'MedicalDetailsController_completeCareSchedule',
  })
  @ApiCreatedResponse({ type: CompleteCareScheduleResponseDto })
  complete(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteCareScheduleDto,
  ): Promise<CompleteCareScheduleResponseDto> {
    return this.careSchedules.complete(actor, id, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('care-schedules/:id/cancel')
  @ApiOperation({
    summary: 'Cancel a care schedule with a reason (F3.11)',
    description: 'Lịch đã hoàn tất/đã hủy: 409.',
  })
  @ApiCreatedResponse({ type: CareScheduleResponseDto })
  cancel(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelCareScheduleDto,
  ): Promise<CareScheduleResponseDto> {
    return this.careSchedules.cancel(actor, id, body);
  }
}
