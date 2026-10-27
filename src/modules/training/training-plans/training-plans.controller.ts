import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  SaveTrainingPlanDto,
  TrainingPlanResponseDto,
} from '../dto/training-plan.dto';
import { TrainingPlansService } from './training-plans.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingPlansController {
  constructor(private readonly plans: TrainingPlansService) {}

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Get('training-plans')
  @ApiOperation({ summary: 'Liệt kê giáo án (Head Trainer: của mình)' })
  @ApiOkResponse({ type: [TrainingPlanResponseDto] })
  list(@CurrentUser() actor: Actor) {
    return this.plans.list(actor);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Get('training-plans/:id')
  @ApiOperation({ summary: 'Xem một giáo án kèm các môn' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('training-plans')
  @ApiOperation({ summary: 'Tạo giáo án ghép môn theo tuần' })
  @ApiCreatedResponse({ type: TrainingPlanResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: SaveTrainingPlanDto) {
    return this.plans.create(actor, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Put('training-plans/:id')
  @ApiOperation({ summary: 'Thay nội dung giáo án của mình' })
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveTrainingPlanDto,
  ) {
    return this.plans.update(actor, id, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Delete('training-plans/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa giáo án chưa có lớp dùng' })
  @ApiNoContentResponse()
  remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.remove(actor, id);
  }
}
