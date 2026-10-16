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
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CreateHorseEnrollmentDto,
  EnrollableHorseDto,
  HorseEnrollmentListItemDto,
  HorseEnrollmentResponseDto,
  LeaveHorseEnrollmentDto,
} from '../dto/horse-enrollment.dto';
import {
  CreateTrainingClassDto,
  TrainingClassPlanResponseDto,
  TrainingClassProgressResponseDto,
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
  @Access([UserRole.HEAD_TRAINER])
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

  @Get('classes/:classId/plan')
  @ApiOperation({
    summary:
      'Giáo án của lớp (bản chép lúc tạo lớp) kèm khoảng ngày và thời lượng tối thiểu của từng giai đoạn',
  })
  @ApiOkResponse({ type: TrainingClassPlanResponseDto })
  getPlan(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classes.getPlan(actor, classId);
  }

  @Get('classes/:classId/progress')
  @ApiOperation({
    summary:
      'Tiến độ xếp lịch theo tuần: mỗi môn đã xếp bao nhiêu buổi so với số buổi tối thiểu',
  })
  @ApiOkResponse({ type: TrainingClassProgressResponseDto })
  getProgress(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classes.getProgress(actor, classId);
  }

  // update class
  @Access([UserRole.HEAD_TRAINER])
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
  @Access([UserRole.HEAD_TRAINER])
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
  @ApiOkResponse({ type: [HorseEnrollmentListItemDto] })
  listEnrollments(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.enrollments.list(actor, classId);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Get('classes/:classId/enrollable-horses')
  @ApiOperation({
    summary:
      'Ngựa trong khu của Head Trainer ghi danh được vào lớp lúc này (bỏ ngựa đã ghi danh và ngựa trùng giờ)',
  })
  @ApiOkResponse({ type: [EnrollableHorseDto] })
  listEnrollableHorses(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.enrollments.listEnrollableHorses(actor, classId);
  }

  // create enrollment
  @Access([UserRole.HEAD_TRAINER])
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
  @Access([UserRole.HEAD_TRAINER])
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
