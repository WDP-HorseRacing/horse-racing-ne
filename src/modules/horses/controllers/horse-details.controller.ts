import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { CreateHorseMeasurementDto } from '../dto/create-horse-measurement.dto';
import { HorseEligibilityResponseDto } from '../dto/horse-eligibility.response.dto';
import { HorseOwnershipResponseDto } from '../dto/horse-ownership.response.dto';
import { HorsePedigreeResponseDto } from '../dto/horse-pedigree.response.dto';
import { HorseMeasurementListQueryDto } from '../dto/horse-measurement-list-query.dto';
import { HorseMeasurementResponseDto } from '../dto/horse-measurement.response.dto';
import { HorseResponseDto } from '../dto/horse.response.dto';
import { SetHorseOwnersDto } from '../dto/set-horse-owners.dto';
import { UpdateHorseHealthDto } from '../dto/update-horse-health.dto';
import { UpdateHorseLifecycleDto } from '../dto/update-horse-lifecycle.dto';
import { HorsesService } from '../services/horses.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseDetailsController {
  constructor(private readonly horsesService: HorsesService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Patch('lifecycle-status')
  @ApiOperation({ summary: 'Change horse lifecycle status' })
  @ApiOkResponse({ type: HorseResponseDto })
  lifecycle(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    return this.horsesService.updateLifecycle(actor, horseId, body);
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
    return this.horsesService.updateHealth(actor, horseId, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('pedigree')
  @ApiOperation({ summary: 'Get horse pedigree up to 4 generations' })
  @ApiQuery({
    name: 'depth',
    required: false,
    schema: { minimum: 1, maximum: 4, default: 2 },
  })
  @ApiOkResponse({ type: HorsePedigreeResponseDto })
  pedigree(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query('depth') depth?: string,
  ): Promise<HorsePedigreeResponseDto> {
    return this.horsesService.getPedigree(actor, horseId, depth);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HORSE_OWNER])
  @Get('owners')
  @ApiOperation({ summary: 'List horse ownership history' })
  @ApiOkResponse({ type: [HorseOwnershipResponseDto] })
  owners(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    return this.horsesService.listOwners(actor, horseId);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Put('owners')
  @ApiOperation({ summary: 'Replace active ownership shares' })
  @ApiOkResponse({ type: [HorseOwnershipResponseDto] })
  setOwners(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: SetHorseOwnersDto,
  ): Promise<HorseOwnershipResponseDto[]> {
    return this.horsesService.replaceOwners(actor, horseId, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])
  @Get('measurements')
  @ApiOperation({ summary: 'List horse measurement history' })
  @ApiOkResponse({ type: [HorseMeasurementResponseDto] })
  measurements(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: HorseMeasurementListQueryDto,
  ): Promise<HorseMeasurementResponseDto[]> {
    return this.horsesService.listMeasurements(actor, horseId, query);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM])
  @Post('measurements')
  @ApiOperation({ summary: 'Record a horse measurement' })
  @ApiCreatedResponse({ type: HorseMeasurementResponseDto })
  addMeasurement(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateHorseMeasurementDto,
  ): Promise<HorseMeasurementResponseDto> {
    return this.horsesService.addMeasurement(actor, horseId, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])
  @Get('eligibility')
  @ApiOperation({ summary: 'Get current training and racing eligibility' })
  @ApiOkResponse({ type: HorseEligibilityResponseDto })
  eligibility(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseEligibilityResponseDto> {
    return this.horsesService.getEligibility(actor, horseId);
  }
}
