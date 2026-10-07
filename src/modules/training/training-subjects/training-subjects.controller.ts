import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  CreateTrainingSubjectDto,
  TrainingSubjectResponseDto,
  UpdateTrainingSubjectDto,
} from '../dto/training-subject.dto';
import { TrainingSubjectsService } from './training-subjects.service';

const SUBJECT_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingSubjectsController {
  constructor(private readonly subjects: TrainingSubjectsService) {}

  @Access(SUBJECT_READERS)
  @Get('training-subjects')
  @ApiOperation({ summary: 'Liệt kê danh mục môn học' })
  @ApiOkResponse({ type: [TrainingSubjectResponseDto] })
  list() {
    return this.subjects.list();
  }

  @Access(SUBJECT_READERS)
  @Get('training-subjects/:subjectId')
  @ApiOperation({ summary: 'Xem một môn học' })
  @ApiOkResponse({ type: TrainingSubjectResponseDto })
  get(@Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.subjects.get(subjectId);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('training-subjects')
  @ApiOperation({ summary: 'Thêm môn học' })
  @ApiCreatedResponse({ type: TrainingSubjectResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: CreateTrainingSubjectDto) {
    return this.subjects.create(actor, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('training-subjects/:subjectId')
  @ApiOperation({ summary: 'Sửa môn học' })
  @ApiOkResponse({ type: TrainingSubjectResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() body: UpdateTrainingSubjectDto,
  ) {
    return this.subjects.update(actor, subjectId, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete('training-subjects/:subjectId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa môn học' })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() actor: Actor,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.subjects.remove(actor, subjectId);
  }
}
