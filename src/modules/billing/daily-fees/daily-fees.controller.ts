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
import { CreateDailyFeeDto, DailyFeeResponseDto } from '../dto/daily-fee.dto';
import { DailyFeesService } from './daily-fees.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('daily-fees')
export class DailyFeesController {
  constructor(private readonly fees: DailyFeesService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get()
  @ApiOperation({ summary: 'Lịch sử mức phí nuôi ngựa theo ngày' })
  @ApiOkResponse({ type: [DailyFeeResponseDto] })
  list(@CurrentUser() actor: Actor) {
    return this.fees.list(actor);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post()
  @ApiOperation({ summary: 'Đặt mức phí nuôi theo ngày áp dụng từ một ngày' })
  @ApiCreatedResponse({ type: DailyFeeResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: CreateDailyFeeDto) {
    return this.fees.create(actor, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa mức phí chưa có hiệu lực' })
  @ApiNoContentResponse()
  remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.fees.remove(actor, id);
  }
}
