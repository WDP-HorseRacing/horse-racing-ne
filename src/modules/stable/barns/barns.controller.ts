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
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  BarnListItemDto,
  BarnResponseDto,
  CreateBarnDto,
  UpdateBarnDto,
} from '../dto/barn.dto';
import { BarnsService } from './barns.service';

@ApiTags('stable')
@ApiBearerAuth()
@Controller('barns')
export class BarnsController {
  constructor(private readonly barnsService: BarnsService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get()
  @ApiOperation({
    summary: 'List barns of the club with their head trainer',
    description:
      'Each barn carries its head trainer name, availableStallCount (free stalls minus horses of the barn still waiting for a stall, never negative; 0 means no more horse can be placed) and pendingStallHorseCount (horses of the barn, not deleted, not TRANSFERRED, without an open stall assignment).',
  })
  @ApiOkResponse({ type: [BarnListItemDto] })
  list(@CurrentUser() actor: Actor): Promise<BarnListItemDto[]> {
    return this.barnsService.list(actor);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get(':id')
  @ApiOperation({ summary: 'Get barn details' })
  @ApiOkResponse({ type: BarnResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BarnResponseDto> {
    return this.barnsService.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post()
  @ApiOperation({ summary: 'Create barn' })
  @ApiCreatedResponse({ type: BarnResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Body() body: CreateBarnDto,
  ): Promise<BarnResponseDto> {
    return this.barnsService.create(actor, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch(':id')
  @ApiOperation({
    summary: 'Rename barn or assign its head trainer',
    description:
      'A head trainer makes decisions and reads sensitive data only for horses stabled in barns they lead.',
  })
  @ApiOkResponse({ type: BarnResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBarnDto,
  ): Promise<BarnResponseDto> {
    return this.barnsService.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete barn' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.barnsService.remove(actor, id);
  }
}
