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
import { CreateRaceDto } from '../dto/create-race.dto';
import { UpdateRaceDto } from '../dto/update-race.dto';

@ApiTags('racing')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('races')
export class RacesController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List races', operationId: 'RacingController_list' })
  list(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Post()
  @ApiOperation({
    summary: 'Create race',
    operationId: 'RacingController_create',
  })
  create(@CurrentUser() _actor: Actor, @Body() _body: CreateRaceDto) {
    return this.pending();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get race and conditions',
    operationId: 'RacingDetailsController_race',
  })
  race(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update race before registration closes',
    operationId: 'RacingDetailsController_updateRace',
  })
  update(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpdateRaceDto,
  ) {
    return this.pending();
  }
}
