import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { CreateHorseDto } from '../dto/create-horse.dto';
import { HorseListQueryDto } from '../dto/horse-list-query.dto';
import {
  HorseDetailResponseDto,
  HorseResponseDto,
} from '../dto/horse.response.dto';
import { UpdateHorseDto } from '../dto/update-horse.dto';
import { HorsesService } from '../services/horses.service';

const ALL_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
  UserRole.HORSE_OWNER,
];

@ApiTags('horses')
@ApiBearerAuth()
@Controller()
export class HorsesController {
  constructor(private readonly horsesService: HorsesService) {}

  @Access(ALL_ROLES)
  @Get('horses')
  @ApiOperation({
    summary: 'List horses visible to the current user',
    description:
      'Club Manager, Head Trainer, Veterinarian: whole club. Groom: horses with an active stable assignment. Horse Owner: horses currently owned.',
  })
  @ApiOkResponse({ type: PaginationResponseDto })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseResponseDto>> {
    return this.horsesService.list(actor, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('horses')
  @ApiOperation({ summary: 'Create horse profile' })
  @ApiCreatedResponse({ type: HorseResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Body() body: CreateHorseDto,
  ): Promise<HorseResponseDto> {
    return this.horsesService.create(actor, body);
  }

  @Access(ALL_ROLES)
  @Get('horses/:id')
  @ApiOperation({ summary: 'Get horse profile detail' })
  @ApiOkResponse({ type: HorseDetailResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HorseDetailResponseDto> {
    return this.horsesService.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('horses/:id')
  @ApiOperation({ summary: 'Update horse profile and pedigree parents' })
  @ApiOkResponse({ type: HorseResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    return this.horsesService.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete('horses/:id')
  @ApiOperation({
    summary: 'Soft-delete a horse profile created by mistake',
    description:
      'Rejected when the horse is a pedigree parent or has ownership history.',
  })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.horsesService.remove(actor, id);
  }

  @Access([UserRole.HORSE_OWNER])
  @Get('owners/me/horses')
  @ApiOperation({ summary: 'List horses currently owned by the current user' })
  @ApiOkResponse({ type: [HorseResponseDto] })
  myHorses(@CurrentUser() actor: Actor): Promise<HorseResponseDto[]> {
    return this.horsesService.listMyHorses(actor);
  }
}
