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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
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
  incidents(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Report stable incident' })
  report(@CurrentUser() _actor: Actor, @Body() _body: ReportIncidentDto) {
    return this.pending();
  }

  @Get('incidents/:id')
  @ApiOperation({ summary: 'Get stable incident' })
  incident(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Patch('incidents/:id/status')
  @ApiOperation({ summary: 'Update incident resolution status' })
  incidentStatus(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpdateIncidentStatusDto,
  ) {
    return this.pending();
  }
}
