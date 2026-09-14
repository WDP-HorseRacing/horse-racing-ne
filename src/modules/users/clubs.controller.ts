import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../common/api/pending-api';
import { UpdateClubDto } from './dto/update-club.dto';

@ApiTags('clubs')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('clubs')
export class ClubsController extends PendingApi {
  @Get('me')
  @ApiOperation({ summary: 'Get current club' })
  me() {
    return this.pending();
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current club settings' })
  update(@Body() _body: UpdateClubDto) {
    return this.pending();
  }
}
