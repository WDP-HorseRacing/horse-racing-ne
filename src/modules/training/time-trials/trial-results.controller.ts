import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
  CreateTrialResultDto,
  TrialResultResponseDto,
  UpdateTrialResultDto,
} from '../dto/time-trial.dto';
import { TrialResultsService } from './trial-results.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrialResultsController {
  constructor(private readonly results: TrialResultsService) {}

  @Get('session-participants/:id/trial-results')
  @ApiOkResponse({ type: [TrialResultResponseDto] })
  list(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.results.list(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('session-participants/:id/trial-results')
  @ApiCreatedResponse({ type: TrialResultResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateTrialResultDto,
  ) {
    return this.results.create(actor, id, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Patch('session-participants/:id/trial-results/:attemptNo')
  @ApiOperation({
    summary: 'Sửa video, thời gian hoặc ghi chú của một lần chạy thử',
    description:
      'Chỉ Head Trainer đang phụ trách lớp; buổi chưa hủy, không giới hạn thời gian sau khi buổi kết thúc. Field bỏ trống giữ nguyên; gửi videoMediaId null để gỡ video, notes null để xóa ghi chú. Gửi elapsedMs hoặc notes thì phải kèm reason. Không sửa số lần chạy.',
  })
  @ApiOkResponse({ type: TrialResultResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attemptNo', ParseIntPipe) attemptNo: number,
    @Body() body: UpdateTrialResultDto,
  ) {
    return this.results.update(actor, id, attemptNo, body);
  }
}
