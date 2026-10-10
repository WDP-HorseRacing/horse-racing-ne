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
  UpdateTrialResultVideoDto,
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
    summary: 'Gắn, đổi hoặc gỡ video của một lần chạy thử',
    description:
      'Chỉ Head Trainer đang phụ trách lớp; buổi chưa hủy và chưa quá 7 ngày kể từ giờ kết thúc dự kiến. Gửi videoMediaId null để gỡ video; chỉ video thay đổi.',
  })
  @ApiOkResponse({ type: TrialResultResponseDto })
  updateVideo(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attemptNo', ParseIntPipe) attemptNo: number,
    @Body() body: UpdateTrialResultVideoDto,
  ) {
    return this.results.updateVideo(actor, id, attemptNo, body);
  }
}
