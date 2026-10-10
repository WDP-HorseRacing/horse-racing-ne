import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  IncidentListQueryDto,
  IncidentPageResponseDto,
  IncidentResponseDto,
  ReportIncidentDto,
  ResolveIncidentDto,
} from '../dto/incident.dto';
import { IncidentsService } from './incidents.service';

const INCIDENT_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Access(INCIDENT_READERS)
  @Get('incidents')
  @ApiOperation({ summary: 'Liệt kê sự cố tại chuồng' })
  @ApiOkResponse({ type: IncidentPageResponseDto })
  list(@CurrentUser() actor: Actor, @Query() query: IncidentListQueryDto) {
    return this.incidents.list(actor, query);
  }

  @Access([UserRole.GROOM])
  @Post('incidents')
  @ApiOperation({ summary: 'Báo sự cố tại chuồng cho ngựa mình phụ trách' })
  @ApiCreatedResponse({ type: IncidentResponseDto })
  report(@CurrentUser() actor: Actor, @Body() body: ReportIncidentDto) {
    return this.incidents.report(actor, body);
  }

  @Access(INCIDENT_READERS)
  @Get('incidents/:id')
  @ApiOperation({ summary: 'Xem một sự cố kèm yêu cầu khám' })
  @ApiOkResponse({ type: IncidentResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.get(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('incidents/:id/refer')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chuyển sự cố cho bác sĩ: tạo yêu cầu khám' })
  @ApiOkResponse({ type: IncidentResponseDto })
  refer(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.refer(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('incidents/:id/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đóng sự cố kèm kết quả xử lý' })
  @ApiOkResponse({ type: IncidentResponseDto })
  resolve(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveIncidentDto,
  ) {
    return this.incidents.resolve(actor, id, body);
  }
}
