import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
  CreateHorseSurchargeDto,
  HorseSurchargeResponseDto,
  UnappliedSurchargeResponseDto,
} from '../dto/horse-surcharge.dto';
import { HorseSurchargesService } from './horse-surcharges.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller()
export class HorseSurchargesController {
  constructor(private readonly surcharges: HorseSurchargesService) {}

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.HORSE_OWNER])
  @Get('horses/:horseId/surcharges')
  @ApiOperation({ summary: 'Phụ phí chăm sóc riêng của ngựa' })
  @ApiOkResponse({ type: [HorseSurchargeResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ) {
    return this.surcharges.list(actor, horseId);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('horses/:horseId/surcharges')
  @ApiOperation({
    summary:
      'Ghi phụ phí chăm sóc riêng cho ngựa theo ngày trong một khoảng ngày; báo Head Trainer khu của ngựa',
  })
  @ApiCreatedResponse({ type: HorseSurchargeResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateHorseSurchargeDto,
  ) {
    return this.surcharges.create(actor, horseId, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Get('horse-surcharges/unapplied')
  @ApiOperation({
    summary:
      'Phụ phí chưa được Head Trainer xác nhận áp dụng, kèm khu và Head Trainer đang phụ trách',
  })
  @ApiOkResponse({ type: [UnappliedSurchargeResponseDto] })
  listUnapplied(@CurrentUser() actor: Actor) {
    return this.surcharges.listUnapplied(actor);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('horse-surcharges/:id/apply')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Head Trainer khu hiện tại xác nhận đã sắp xếp chế độ chăm sóc theo nội dung phụ phí',
  })
  @ApiOkResponse({ type: HorseSurchargeResponseDto })
  apply(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.surcharges.apply(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('horse-surcharges/:id/end')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Kết thúc sớm phụ phí đang tính, tính tới hết hôm nay',
  })
  @ApiOkResponse({ type: HorseSurchargeResponseDto })
  end(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.surcharges.end(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete('horse-surcharges/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa phụ phí chưa tới ngày bắt đầu' })
  @ApiNoContentResponse()
  remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.surcharges.remove(actor, id);
  }
}
