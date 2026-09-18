import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import {
  ReportIncidentDto,
  UpdateIncidentStatusDto,
} from '../dto/incident.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class IncidentsController extends PendingApi {
  @Get('incidents')
  @ApiOperation({ summary: 'List stable incidents' })
  incidents() {
    return this.pending();
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Report stable incident' })
  report(@Body() _body: ReportIncidentDto) {
    return this.pending();
  }

  @Get('incidents/:id')
  @ApiOperation({ summary: 'Get stable incident' })
  incident(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('incidents/:id/status')
  @ApiOperation({ summary: 'Update incident resolution status' })
  incidentStatus(
    @Param('id') _id: string,
    @Body() _body: UpdateIncidentStatusDto,
  ) {
    return this.pending();
  }
}
