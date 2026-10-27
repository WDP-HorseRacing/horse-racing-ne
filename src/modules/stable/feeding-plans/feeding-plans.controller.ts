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
  Query,
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
  CreateFeedingPlansDto,
  FeedingPlanListQueryDto,
  FeedingPlanResponseDto,
  ReplaceFeedingPlanDto,
} from '../dto/feeding-plan.dto';
import { FeedingPlansService } from './feeding-plans.service';

const PLAN_READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class FeedingPlansController {
  constructor(private readonly plans: FeedingPlansService) {}

  @Access(PLAN_READERS)
  @Get('horses/:horseId/feeding-plans')
  @ApiOperation({ summary: 'Liệt kê khẩu phần của ngựa' })
  @ApiOkResponse({ type: [FeedingPlanResponseDto] })
  listForHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: FeedingPlanListQueryDto,
  ) {
    return this.plans.listForHorse(actor, horseId, query);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('feeding-plans')
  @ApiOperation({ summary: 'Lập bản nháp khẩu phần cho một hoặc nhiều ngựa' })
  @ApiCreatedResponse({ type: [FeedingPlanResponseDto] })
  create(@CurrentUser() actor: Actor, @Body() body: CreateFeedingPlansDto) {
    return this.plans.create(actor, body);
  }

  @Access(PLAN_READERS)
  @Get('feeding-plans/:id')
  @ApiOperation({ summary: 'Xem một khẩu phần' })
  @ApiOkResponse({ type: FeedingPlanResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Put('feeding-plans/:id')
  @ApiOperation({ summary: 'Thay toàn bộ dòng của bản nháp khẩu phần' })
  @ApiOkResponse({ type: FeedingPlanResponseDto })
  replace(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplaceFeedingPlanDto,
  ) {
    return this.plans.replace(actor, id, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Delete('feeding-plans/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa bản nháp khẩu phần' })
  @ApiNoContentResponse()
  remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.remove(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('feeding-plans/:id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Duyệt bản nháp thành khẩu phần đang áp dụng của ngựa',
  })
  @ApiOkResponse({ type: FeedingPlanResponseDto })
  approve(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.approve(actor, id);
  }
}
