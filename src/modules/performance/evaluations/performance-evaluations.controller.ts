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
import { UserRole } from '../../../common/enums';
import {
  CreatePerformanceEvaluationDto,
  PerformanceEvaluationResponseDto,
  UpdatePerformanceEvaluationDto,
} from '../dto/performance-evaluation.dto';
import { PerformanceEvaluationsService } from './performance-evaluations.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceEvaluationsController {
  constructor(private readonly evaluations: PerformanceEvaluationsService) {}

  @Access([UserRole.HEAD_TRAINER])
  @Post('session-participants/:id/evaluation')
  @ApiCreatedResponse({ type: PerformanceEvaluationResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreatePerformanceEvaluationDto,
  ) {
    return this.evaluations.create(actor, id, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.VETERINARIAN,
    UserRole.HEAD_TRAINER,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])
  @Get('session-participants/:id/evaluation')
  @ApiOkResponse({ type: PerformanceEvaluationResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.get(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Patch('session-participants/:id/evaluation')
  @ApiOperation({
    summary: 'Sửa điểm hoặc nhận xét của đánh giá lượt tập',
    description:
      'Chỉ Head Trainer phụ trách lớp, ngựa thuộc khu mình; buổi chưa hủy, không giới hạn thời gian sau khi buổi kết thúc. Bắt buộc reason; field bỏ trống giữ nguyên, comment null để xóa nhận xét.',
  })
  @ApiOkResponse({ type: PerformanceEvaluationResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePerformanceEvaluationDto,
  ) {
    return this.evaluations.update(actor, id, body);
  }
}
