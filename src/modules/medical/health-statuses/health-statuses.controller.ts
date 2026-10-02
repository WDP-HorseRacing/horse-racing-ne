import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  HealthHistoryItemDto,
  HealthStatusChangeResponseDto,
  UpdateHealthStatusDto,
} from '../dto';
import { HealthStatusesService } from './health-statuses.service';
import { MEDICAL_READER_ROLES } from '../constants/medical.constants';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class HealthStatusesController {
  constructor(private readonly healthStatuses: HealthStatusesService) {}

  @Access([UserRole.VETERINARIAN])
  @Patch('horses/:horseId/health-status')
  @ApiOperation({
    summary: 'Change horse health status with a reason',
    description:
      'Bắt buộc lý do. Trùng trạng thái cũ thì changed = false, không ghi nhật ký. Được đặt ELIGIBLE khi đang có lệnh khóa. Ngựa đã chuyển nhượng: 409.',
    operationId: 'HorseStatusesController_updateHealth',
  })
  @ApiOkResponse({ type: HealthStatusChangeResponseDto })
  updateHealth(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHealthStatusDto,
  ): Promise<HealthStatusChangeResponseDto> {
    return this.healthStatuses.updateHealth(actor, horseId, body);
  }

  @Access(MEDICAL_READER_ROLES)
  @Get('horses/:horseId/health-history')
  @ApiOperation({
    summary: 'Horse health status history',
    description: 'Mới nhất lên trên. Groom không xem.',
  })
  @ApiOkResponse({ type: [HealthHistoryItemDto] })
  history(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HealthHistoryItemDto[]> {
    return this.healthStatuses.history(actor, horseId);
  }
}
