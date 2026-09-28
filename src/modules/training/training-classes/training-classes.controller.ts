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
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CreateHorseEnrollmentDto,
  HorseEnrollmentResponseDto,
  LeaveHorseEnrollmentDto,
} from '../dto/horse-enrollment.dto';
import {
  CreateTrainingClassDto,
  TrainingClassResponseDto,
  UpdateTrainingClassStatusDto,
  UpdateTrainingClassDto,
} from '../dto/training-class.dto';
import {
  TrainingClassEnrollmentsService,
  TrainingClassesService,
} from './services';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingClassesController {
  constructor(
    private readonly classes: TrainingClassesService,
    private readonly enrollments: TrainingClassEnrollmentsService,
  ) {}

  // get class
  @Get('classes')
  @ApiOkResponse({ type: [TrainingClassResponseDto] })
  list(@CurrentUser() actor: Actor) {
    return this.classes.list(actor);
  }

  // create class
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('classes')
  @ApiCreatedResponse({ type: TrainingClassResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: CreateTrainingClassDto) {
    return this.classes.create(actor, body);
  }

  // get class by id
  @Get('classes/:classId')
  @ApiOkResponse({ type: TrainingClassResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classes.get(actor, classId);
  }

  // update class
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('classes/:classId')
  @ApiOkResponse({ type: TrainingClassResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: UpdateTrainingClassDto,
  ) {
    return this.classes.update(actor, classId, body);
  }

  // update class status
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('classes/:classId/status')
  @ApiOkResponse({ type: TrainingClassResponseDto })
  updateStatus(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: UpdateTrainingClassStatusDto,
  ) {
    return this.classes.updateStatus(actor, classId, body);
  }

  // get enrollments by classId
  @Get('classes/:classId/enrollments')
  @ApiOkResponse({ type: [HorseEnrollmentResponseDto] })
  listEnrollments(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.enrollments.list(actor, classId);
  }

  // create enrollment
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('classes/:classId/enrollments')
  @ApiCreatedResponse({ type: HorseEnrollmentResponseDto })
  createEnrollment(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: CreateHorseEnrollmentDto,
  ) {
    return this.enrollments.create(actor, classId, body);
  }

  // leave enrollment
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('enrollments/:id/leave')
  @ApiOkResponse({ type: HorseEnrollmentResponseDto })
  leaveEnrollment(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LeaveHorseEnrollmentDto,
  ) {
    return this.enrollments.leave(actor, id, body);
  }
}
