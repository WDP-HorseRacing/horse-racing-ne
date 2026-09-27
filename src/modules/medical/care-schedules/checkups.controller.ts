import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
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
    summary: 'Routine checkup schedule of the herd (F3.2)',
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
    summary: 'Set or reschedule the routine checkup appointment (F3.2)',
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
}
