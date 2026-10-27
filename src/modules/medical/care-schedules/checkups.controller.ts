import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CancelCareScheduleDto,
  CheckupAppointmentDto,
  CheckupItemDto,
  CheckupListQueryDto,
  SetCheckupAppointmentDto,
} from '../dto';
import { CheckupsService } from './checkups.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class CheckupsController {
  constructor(private readonly checkups: CheckupsService) {}

  @Access([UserRole.VETERINARIAN, UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Get('medical/checkups')
  @ApiOperation({
    summary: 'Routine checkup schedule of the herd',
    description:
      'Chu kỳ cố định 30 ngày. Quá hạn lên đầu rồi tới đến hạn. Không tính ngựa đã chuyển nhượng và hồ sơ đã xóa.',
  })
  @ApiOkResponse({ type: [CheckupItemDto] })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: CheckupListQueryDto,
  ): Promise<CheckupItemDto[]> {
    return this.checkups.list(actor, query);
  }

  @Access([UserRole.VETERINARIAN])
  @Put('horses/:horseId/checkup-appointment')
  @ApiOperation({
    summary: 'Set or reschedule the routine checkup appointment',
    description:
      'Không ở quá khứ; ngựa chưa quá hạn thì không muộn hơn hạn khám (400). Dời lịch đã đặt bắt buộc reason. Ngựa đã chuyển nhượng: 409.',
  })
  @ApiOkResponse({ type: CheckupAppointmentDto })
  setAppointment(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: SetCheckupAppointmentDto,
  ): Promise<CheckupAppointmentDto> {
    return this.checkups.setAppointment(actor, horseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Delete('horses/:horseId/checkup-appointment')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel the active routine checkup appointment',
    description:
      'Bắt buộc reason. Ngày hẹn chuyển Đã hủy. Không có ngày hẹn đang hiệu lực: 404. Ngựa đã chuyển nhượng hoặc đã mất: 409.',
  })
  @ApiNoContentResponse()
  cancelAppointment(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CancelCareScheduleDto,
  ): Promise<void> {
    return this.checkups.cancelAppointment(actor, horseId, body);
  }
}
