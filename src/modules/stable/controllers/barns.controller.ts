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
import { BarnResponseDto, CreateBarnDto, UpdateBarnDto } from '../dto/barn.dto';
import { BarnsService } from '../services/barns.service';

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
  @ApiOperation({ summary: 'List barns of the club with their head trainer' })
  @ApiOkResponse({ type: [BarnResponseDto] })
  list(@CurrentUser() actor: Actor): Promise<BarnResponseDto[]> {
    return this.barnsService.list(actor);
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
}
