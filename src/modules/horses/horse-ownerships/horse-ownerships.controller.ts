import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
  HorseOwnershipResponseDto,
  HorseResponseDto,
  SetHorseOwnersDto,
} from '../dto/horse.dto';
import { HorseOwnershipsService } from './horse-ownerships.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller()
export class HorseOwnershipsController {
  constructor(private readonly ownershipsService: HorseOwnershipsService) {}

  @Access([UserRole.CLUB_MANAGER, UserRole.HORSE_OWNER])
  @Get('horses/:horseId/owners')
  @ApiOperation({ summary: 'List horse ownership history' })
  @ApiOkResponse({ type: [HorseOwnershipResponseDto] })
  owners(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    return this.ownershipsService.listOwners(actor, horseId);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Put('horses/:horseId/owners')
  @ApiOperation({ summary: 'Replace active ownership shares' })
  @ApiOkResponse({ type: [HorseOwnershipResponseDto] })
  setOwners(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: SetHorseOwnersDto,
  ): Promise<HorseOwnershipResponseDto[]> {
    return this.ownershipsService.replaceOwners(actor, horseId, body);
  }

  @Access([UserRole.HORSE_OWNER])
  @Get('owners/me/horses')
  @ApiOperation({ summary: 'List horses currently owned by the current user' })
  @ApiOkResponse({ type: [HorseResponseDto] })
  myHorses(@CurrentUser() actor: Actor): Promise<HorseResponseDto[]> {
    return this.ownershipsService.listMyHorses(actor);
  }
}
