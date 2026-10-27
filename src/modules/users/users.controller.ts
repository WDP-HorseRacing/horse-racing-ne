import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { Access, CurrentUser } from '../../common/decorators';
import { PaginationResponseDto } from '../../common/dto/pagination-response.dto';
import type { Actor } from '../../common/types/actor';
import {
  CreateUserDto,
  ResetUserPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserListQueryDto,
  UserResponseDto,
} from './dto/user.dto';
import {
  HeadTrainerHandoverDto,
  HeadTrainerHandoverResultDto,
} from './dto/head-trainer-handover.dto';
import { HeadTrainerHandoverService } from './services/head-trainer-handover.service';
import { UsersService } from './services/users.service';
import { UserRole } from './user.enums';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly handovers: HeadTrainerHandoverService,
  ) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get()
  @ApiOperation({ summary: 'List club users' })
  @ApiOkResponse({ type: PaginationResponseDto })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: UserListQueryDto,
  ): Promise<PaginationResponseDto<UserResponseDto>> {
    return this.usersService.list(actor, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Get(':id')
  @ApiOperation({ summary: 'Get club user' })
  @ApiOkResponse({ type: UserResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post()
  @ApiOperation({ summary: 'Create club user' })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Body() body: CreateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.create(actor, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch(':id/status')
  @ApiOperation({ summary: 'Change user account status' })
  @ApiOkResponse({ type: UserResponseDto })
  status(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.usersService.setStatus(actor, id, body.status);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset a staff account password',
    description:
      'Đặt mật khẩu mới (đăng nhập được ngay) cho tài khoản nhân viên rồi đăng xuất mọi phiên của người đó. Không đặt lại cho chính mình hoặc Club Manager khác; tài khoản đã khóa vẫn đặt lại được.',
  })
  @ApiNoContentResponse()
  resetPassword(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetUserPasswordDto,
  ): Promise<void> {
    return this.usersService.resetPassword(actor, id, body.newPassword);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch(':id')
  @ApiOperation({ summary: 'Update club user' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post(':id/head-trainer-handover')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Bàn giao khu chuồng, giáo án và lớp chưa kết thúc của Head Trainer sang Head Trainer khác',
  })
  @ApiOkResponse({ type: HeadTrainerHandoverResultDto })
  handover(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HeadTrainerHandoverDto,
  ): Promise<HeadTrainerHandoverResultDto> {
    return this.handovers.handover(actor, id, body);
  }
}
