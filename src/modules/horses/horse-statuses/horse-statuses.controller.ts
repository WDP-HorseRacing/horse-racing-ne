import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
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
  HorseResponseDto,
  UpdateHorseHealthDto,
  UpdateHorseLifecycleDto,
} from '../dto/horse.dto';
import { HorseStatusesService } from './horse-statuses.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseStatusesController {
  constructor(private readonly statusesService: HorseStatusesService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Patch('lifecycle-status')
  @ApiOperation({ summary: 'Change horse lifecycle status' })
  @ApiOkResponse({ type: HorseResponseDto })
  lifecycle(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    return this.statusesService.updateLifecycle(actor, horseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Patch('health-status')
  @ApiOperation({ summary: 'Change horse health status' })
  @ApiOkResponse({ type: HorseResponseDto })
  health(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseHealthDto,
  ): Promise<HorseResponseDto> {
    return this.statusesService.updateHealth(actor, horseId, body);
  }
}
