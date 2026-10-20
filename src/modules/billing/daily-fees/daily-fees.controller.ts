import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
  CreateDailyFeeDto,
  DailyFeeResponseDto,
  UpdateDailyFeeDto,
} from '../dto/daily-fee.dto';
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
  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa số tiền của mức phí nuôi theo ngày',
    description:
      'Sửa được mức chưa hiệu lực (ngày hiệu lực sau hôm nay) và mức đang áp dụng (ngày hiệu lực lớn nhất từ hôm nay trở về trước). Mức đã được thay bằng mức mới trả 409. Không đổi được ngày hiệu lực. Gửi đúng số tiền đang có thì không ghi gì và trả về mức phí hiện có. Báo cáo phí tính lại theo số tiền mới cho mọi ngày mức phí áp dụng.',
  })
  @ApiOkResponse({ type: DailyFeeResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDailyFeeDto,
  ) {
    return this.fees.update(actor, id, body);
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
