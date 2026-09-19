import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
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
  @Put('horses/:id/groom')
  @ApiOperation({
    summary: 'Assign or change the groom of a horse',
    description:
      'Closes the current groom assignment and opens a new one. Assigning the current groom again changes nothing. Head Trainer: only horses in their barn.',
  })
  @ApiOkResponse({ type: GroomAssignmentResponseDto })
  assign(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignGroomDto,
  ): Promise<GroomAssignmentResponseDto> {
    return this.groomAssignmentsService.assign(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Delete('horses/:id/groom')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the current groom assignment of a horse',
    description: 'Head Trainer: only horses in their barn.',
  })
  @ApiNoContentResponse()
  end(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.groomAssignmentsService.end(actor, id);
  }
}
