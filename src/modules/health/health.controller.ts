import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API process health' })
  @ApiResponse({ status: 200, description: 'API process is running' })
  check() {
    return { status: 'ok' as const };
  }
}
