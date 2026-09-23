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
import { CreateRegistrationDto } from '../dto/create-registration.dto';
import { UpdateRegistrationDto } from '../dto/update-registration.dto';

@ApiTags('racing')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class RaceRegistrationsController extends PendingApi {
  @Post('races/:id/registrations')
  @ApiOperation({
    summary: 'Register eligible horse for race',
    operationId: 'RacingController_register',
  })
  register(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: CreateRegistrationDto,
  ) {
    return this.pending();
  }

  @Patch('races/:id/registrations/:registrationId')
  @ApiOperation({
    summary: 'Approve or reject race registration',
    operationId: 'RacingController_updateRegistration',
  })
  update(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('registrationId', ParseUUIDPipe) _registrationId: string,
    @Body() _body: UpdateRegistrationDto,
  ) {
    return this.pending();
  }

  @Get('races/:id/registrations')
  @ApiOperation({
    summary: 'List race registrations',
    operationId: 'RacingDetailsController_registrations',
  })
  list(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }

  @Get('races/:id/registrations/:registrationId')
  @ApiOperation({
    summary: 'Get race registration and approvals',
    operationId: 'RacingDetailsController_registration',
  })
  get(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('registrationId', ParseUUIDPipe) _registrationId: string,
  ) {
    return this.pending();
  }
}
