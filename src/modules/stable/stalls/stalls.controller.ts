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
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreateStallAssignmentDto,
  CreateStallDto,
  StallAssignmentResponseDto,
  StallListQueryDto,
  StallResponseDto,
  UpdateStallDto,
} from '../dto/stall.dto';
import { StallsService } from './stalls.service';

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class StallsController {
  constructor(private readonly stallsService: StallsService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get('stalls')
  @ApiOperation({ summary: 'List club stalls' })
  @ApiOkResponse({ type: [StallResponseDto] })
  stalls(
    @CurrentUser() actor: Actor,
    @Query() query: StallListQueryDto,
  ): Promise<StallResponseDto[]> {
    return this.stallsService.list(actor, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('stalls')
  @ApiOperation({ summary: 'Create stall' })
  @ApiCreatedResponse({ type: StallResponseDto })
  createStall(
    @CurrentUser() actor: Actor,
    @Body() body: CreateStallDto,
  ): Promise<StallResponseDto> {
    return this.stallsService.create(actor, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get('stalls/:id')
  @ApiOperation({ summary: 'Get stall' })
  @ApiOkResponse({ type: StallResponseDto })
  stall(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StallResponseDto> {
    return this.stallsService.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('stalls/:id')
  @ApiOperation({ summary: 'Update stall' })
  @ApiOkResponse({ type: StallResponseDto })
  updateStall(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStallDto,
  ): Promise<StallResponseDto> {
    return this.stallsService.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete('stalls/:id')
  @ApiOperation({ summary: 'Soft-delete stall' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteStall(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.stallsService.remove(actor, id);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get('stalls/:id/assignments')
  @ApiOperation({ summary: 'List stall assignment history' })
  @ApiOkResponse({ type: [StallAssignmentResponseDto] })
  assignments(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StallAssignmentResponseDto[]> {
    return this.stallsService.listAssignments(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('stalls/:id/assignments')
  @ApiOperation({ summary: 'Assign horse and groom to stall' })
  @ApiCreatedResponse({ type: StallAssignmentResponseDto })
  assign(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateStallAssignmentDto,
  ): Promise<StallAssignmentResponseDto> {
    return this.stallsService.assign(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Post('stall-assignments/:id/end')
  @ApiOperation({ summary: 'End stall assignment' })
  @ApiOkResponse({ type: StallAssignmentResponseDto })
  endAssignment(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StallAssignmentResponseDto> {
    return this.stallsService.endAssignment(actor, id);
  }
}

export { StallsController as StallController };
