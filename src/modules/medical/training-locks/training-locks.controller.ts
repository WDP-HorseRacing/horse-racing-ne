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
import { CreateTrainingLockDto } from '../dto/create-training-lock.dto';
import { ReleaseTrainingLockDto } from '../dto/release-training-lock.dto';
import { UpdateTrainingLockDto } from '../dto/update-training-lock.dto';

@ApiTags('medical')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class TrainingLocksController extends PendingApi {
  @Post('horses/:horseId/training-locks')
  @ApiOperation({
    summary: 'Create veterinary training lock',
    operationId: 'MedicalController_lock',
  })
  create(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Body() _body: CreateTrainingLockDto,
  ) {
    return this.pending();
  }

  @Post('training-locks/:id/release')
  @ApiOperation({
    summary: 'Release veterinary training lock',
    operationId: 'MedicalController_release',
  })
  release(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: ReleaseTrainingLockDto,
  ) {
    return this.pending();
  }

  @Get('horses/:horseId/training-locks')
  @ApiOperation({
    summary: 'List horse training lock history',
    operationId: 'MedicalDetailsController_locks',
  })
  list(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
  ) {
    return this.pending();
  }

  @Get('training-locks/:id')
  @ApiOperation({
    summary: 'Get training lock details',
    operationId: 'MedicalDetailsController_lock',
  })
  get(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }

  @Patch('training-locks/:id')
  @ApiOperation({
    summary: 'Update active veterinary training lock',
    operationId: 'MedicalDetailsController_updateLock',
  })
  update(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpdateTrainingLockDto,
  ) {
    return this.pending();
  }
}
