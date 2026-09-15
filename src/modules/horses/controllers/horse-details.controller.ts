import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { UpdateHorseStatusDto } from '../dto/update-horse-status.dto';

@ApiTags('horses')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('horses/:horseId')
export class HorseDetailsController extends PendingApi {
  @Get('owners')
  @ApiOperation({ summary: 'List horse ownership history' })
  owners(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Get('pedigree')
  @ApiOperation({ summary: 'Get horse pedigree' })
  pedigree(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Get('eligibility')
  @ApiOperation({ summary: 'Get current training and racing eligibility' })
  eligibility(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Patch('status')
  @ApiOperation({ summary: 'Change horse health or lifecycle status' })
  status(
    @Param('horseId') _horseId: string,
    @Body() _body: UpdateHorseStatusDto,
  ) {
    return this.pending();
  }
}
