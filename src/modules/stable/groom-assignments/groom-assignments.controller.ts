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
  AssignGroomDto,
  GroomAssignmentResponseDto,
  GroomWorkloadResponseDto,
} from '../dto/groom-assignment.dto';
import { GroomAssignmentsService } from './groom-assignments.service';

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class GroomAssignmentsController {
  constructor(
    private readonly groomAssignmentsService: GroomAssignmentsService,
  ) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get('horses/:id/grooms')
  @ApiOperation({ summary: 'List the groom history of a horse' })
  @ApiOkResponse({ type: [GroomAssignmentResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroomAssignmentResponseDto[]> {
    return this.groomAssignmentsService.listByHorse(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Get('grooms/workload')
  @ApiOperation({
    summary: 'List active grooms with the number of horses each one cares for',
    description:
      'Counts open groom assignments of non-deleted horses across the whole club. Grooms with no horse are listed with 0.',
  })
  @ApiOkResponse({ type: [GroomWorkloadResponseDto] })
  workload(@CurrentUser() actor: Actor): Promise<GroomWorkloadResponseDto[]> {
    return this.groomAssignmentsService.listWorkload(actor);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Put('horses/:id/groom')
  @ApiOperation({
    summary: 'Assign or change the groom of a horse',
    description:
      'Head Trainer of the horse barn only; the horse must already have a barn. Closes the current groom assignment, opens a new one and moves the old groom unfinished daily checklists from today on to the new groom. Assigning the current groom again changes nothing.',
  })
  @ApiOkResponse({ type: GroomAssignmentResponseDto })
  assign(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignGroomDto,
  ): Promise<GroomAssignmentResponseDto> {
    return this.groomAssignmentsService.assign(actor, id, body);
  }
}
