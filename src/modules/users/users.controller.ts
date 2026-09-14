import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../common/api/pending-api';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('users')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('users')
export class UsersController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List club users' })
  list(@Query('limit') _limit?: number) {
    return this.pending();
  }

  @Post()
  @ApiOperation({ summary: 'Create club user' })
  create(@Body() _body: CreateUserDto) {
    return this.pending();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update club user' })
  update(@Param('id') _id: string, @Body() _body: UpdateUserDto) {
    return this.pending();
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change user account status' })
  status(@Param('id') _id: string, @Body() _body: UpdateUserStatusDto) {
    return this.pending();
  }
}
