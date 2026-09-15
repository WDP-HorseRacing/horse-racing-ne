import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { ReportIncidentDto } from '../dto/report-incident.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class StableController extends PendingApi {
  @Get('grooms/me/today')
  @ApiOperation({ summary: 'Get today assigned groom checklist' })
  today() {
    return this.pending();
  }

  @Patch('checklists/:id/complete')
  @ApiOperation({ summary: 'Complete assigned checklist item' })
  complete(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Report stable incident' })
  report(@Body() _body: ReportIncidentDto) {
    return this.pending();
  }
}
