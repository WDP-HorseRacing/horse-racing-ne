import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreateTrainingLockDto,
  ReleaseTrainingLockDto,
  TrainingLockResponseDto,
} from '../dto';
import { TrainingLockService } from './training-locks.service';

const LOCK_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.HORSE_OWNER,
];

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class TrainingLocksController {
  constructor(private readonly trainingLocks: TrainingLockService) {}

  @Access([UserRole.VETERINARIAN])
  @Post('horses/:horseId/training-locks')
  @ApiOperation({
    summary: 'Set a veterinary training lock (F3.8)',
    description:
      'Ngựa đã có khóa hiệu lực hoặc đã chuyển nhượng: 409. Ngày dự kiến gỡ ở quá khứ: 400. Ngựa đang có bệnh án mở thì khóa gắn vào bệnh án.',
    operationId: 'MedicalController_lock',
  })
  @ApiCreatedResponse({ type: TrainingLockResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateTrainingLockDto,
  ): Promise<TrainingLockResponseDto> {
    return this.trainingLocks.setLock(actor, horseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('training-locks/:id/release')
  @ApiOperation({
    summary: 'Release a training lock with a reason (F3.8)',
    description: 'Lệnh khóa đã gỡ: 409.',
    operationId: 'MedicalController_release',
  })
  @ApiCreatedResponse({ type: TrainingLockResponseDto })
  release(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReleaseTrainingLockDto,
  ): Promise<TrainingLockResponseDto> {
    return this.trainingLocks.releaseLock(actor, id, body);
  }

  @Access(LOCK_READERS)
  @Get('horses/:horseId/training-locks')
  @ApiOperation({
    summary: 'List current and past training locks of a horse (F3.10)',
    description:
      'Groom không xem chi tiết khóa, chỉ thấy nhãn trong hồ sơ ngựa (F1.3).',
    operationId: 'MedicalDetailsController_locks',
  })
  @ApiOkResponse({ type: [TrainingLockResponseDto] })
  locks(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<TrainingLockResponseDto[]> {
    return this.trainingLocks.listByHorse(actor, horseId);
  }

  @Access(LOCK_READERS)
  @Get('training-locks/:id')
  @ApiOperation({
    summary: 'Get a training lock',
    operationId: 'MedicalDetailsController_lock',
  })
  @ApiOkResponse({ type: TrainingLockResponseDto })
  lock(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TrainingLockResponseDto> {
    return this.trainingLocks.getLock(actor, id);
  }
}
