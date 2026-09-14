import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';
import { CreateRaceDto } from '../dto/create-race.dto';
import { CreateRegistrationDto } from '../dto/create-registration.dto';
import { UpdateRegistrationDto } from '../dto/update-registration.dto';
import { RecordResultDto } from '../dto/record-result.dto';

@ApiTags('racing')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('races')
export class RacingController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List races' })
  list() {
    return this.pending();
  }

  @Post()
  @ApiOperation({ summary: 'Create race' })
  create(@Body() _body: CreateRaceDto) {
    return this.pending();
  }

  @Post(':id/registrations')
  @ApiOperation({ summary: 'Register eligible horse for race' })
  register(@Param('id') _id: string, @Body() _body: CreateRegistrationDto) {
    return this.pending();
  }

  @Patch(':id/registrations/:registrationId')
  @ApiOperation({ summary: 'Approve or reject race registration' })
  updateRegistration(
    @Param('id') _id: string,
    @Param('registrationId') _registrationId: string,
    @Body() _body: UpdateRegistrationDto,
  ) {
    return this.pending();
  }

  @Patch(':id/registrations/:registrationId/result')
  @ApiOperation({ summary: 'Record race result for registration' })
  recordResult(
    @Param('id') _id: string,
    @Param('registrationId') _registrationId: string,
    @Body() _body: RecordResultDto,
  ) {
    return this.pending();
  }
}
