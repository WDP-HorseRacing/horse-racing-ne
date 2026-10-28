import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  AuditLogDetailDto,
  AuditLogListQueryDto,
  AuditLogPageDto,
} from '../dto/audit-log.dto';
import { AuditLogsService } from '../services/audit-logs.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly logs: AuditLogsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get()
  @ApiOperation({ summary: 'List club audit records' })
  @ApiOkResponse({ type: AuditLogPageDto })
  list(@CurrentUser() actor: Actor, @Query() query: AuditLogListQueryDto) {
    return this.logs.list(actor, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Get(':id')
  @ApiOperation({ summary: 'Get club audit record' })
  @ApiOkResponse({ type: AuditLogDetailDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.logs.get(actor, id);
  }
}
