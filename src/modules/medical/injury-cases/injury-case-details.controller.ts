import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { RecordRecoveryDto } from '../dto/record-recovery.dto';

@ApiTags('medical')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class InjuryCaseDetailsController extends PendingApi {
  @Get('injury-cases/:id/timeline')
  @ApiOperation({
    summary: 'Get append-only injury recovery timeline',
    operationId: 'MedicalDetailsController_injuryTimeline',
  })
  injuryTimeline(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Post('injury-cases/:id/recovery-events')
  @ApiOperation({
    summary: 'Append injury recovery event',
    operationId: 'MedicalDetailsController_recordRecovery',
  })
  recordRecovery(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: RecordRecoveryDto,
  ) {
    return this.pending();
  }
}
