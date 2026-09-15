import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { UpdateRaceDto } from '../dto/update-race.dto';

@ApiTags('racing')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class RacingDetailsController extends PendingApi {
  @Get('races/:id')
  @ApiOperation({ summary: 'Get race and conditions' })
  race(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('races/:id')
  @ApiOperation({ summary: 'Update race before registration closes' })
  updateRace(@Param('id') _id: string, @Body() _body: UpdateRaceDto) {
    return this.pending();
  }

  @Get('races/:id/registrations')
  @ApiOperation({ summary: 'List race registrations' })
  registrations(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('races/:id/registrations/:registrationId')
  @ApiOperation({ summary: 'Get race registration and approvals' })
  registration(
    @Param('id') _id: string,
    @Param('registrationId') _registrationId: string,
  ) {
    return this.pending();
  }

  @Get('races/:id/results')
  @ApiOperation({ summary: 'Get race results' })
  results(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('horses/:horseId/race-results')
  @ApiOperation({ summary: 'Get horse race history' })
  horseResults(@Param('horseId') _horseId: string) {
    return this.pending();
  }
}
