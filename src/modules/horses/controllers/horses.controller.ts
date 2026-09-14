import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';
import { CreateHorseDto } from '../dto/create-horse.dto';
import { SetHorseOwnersDto } from '../dto/set-horse-owners.dto';
import { UpdateHorseDto } from '../dto/update-horse.dto';

@ApiTags('horses')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class HorsesController extends PendingApi {
  @Get('horses')
  @ApiOperation({ summary: 'List visible horses' })
  list(@Query('limit') _limit?: number) {
    return this.pending();
  }

  @Post('horses')
  @ApiOperation({ summary: 'Create horse profile' })
  create(@Body() _body: CreateHorseDto) {
    return this.pending();
  }

  @Get('horses/:id')
  @ApiOperation({ summary: 'Get horse profile' })
  get(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('horses/:id')
  @ApiOperation({ summary: 'Update horse profile' })
  update(@Param('id') _id: string, @Body() _body: UpdateHorseDto) {
    return this.pending();
  }

  @Delete('horses/:id')
  @ApiOperation({ summary: 'Soft-delete horse profile' })
  remove(@Param('id') _id: string) {
    return this.pending();
  }

  @Put('horses/:id/owners')
  @ApiOperation({ summary: 'Replace active ownership shares' })
  setOwners(@Param('id') _id: string, @Body() _body: SetHorseOwnersDto) {
    return this.pending();
  }

  @Get('owners/me/horses')
  @ApiOperation({ summary: 'List horses owned by current user' })
  myHorses() {
    return this.pending();
  }
}
