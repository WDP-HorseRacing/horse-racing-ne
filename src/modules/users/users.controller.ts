import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access } from '../../common/integration/keycloak/decorators/access.decorator';
import { CurrentUser } from '../../common/integration/keycloak/decorators/current-user.decorator';
import type { Actor } from '../../common/auth/actor';
import { ApproveUserDto } from './dto/approve-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UsersService } from './services/users.service';
import { UserRole } from './user.enums';

// Da bo `extends PendingApi` va @ApiResponse({ status: 501 }) o cap class:
// finalizeOpenApi xoa moi response 2xx cua operation nao con khai 501.
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Dat TRUOC @Get(':id') - nguoc lai thi 'pending' bi :id nuot mat.
  @Access([UserRole.CLUB_MANAGER])
  @Get('pending')
  @ApiOperation({ summary: 'Danh sach ho so cho duyet cua CLB' })
  @ApiOkResponse({ type: [UserResponseDto] })
  listPending(@CurrentUser() actor: Actor): Promise<UserResponseDto[]> {
    return this.usersService.listPending(actor);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Get()
  @ApiOperation({ summary: 'List club users' })
  @ApiOkResponse({ type: [UserResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<UserResponseDto[]> {
    return this.usersService.list(actor, limit);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
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
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Duyet ho so: gan CLB va role' })
  @ApiOkResponse({ type: UserResponseDto })
  approve(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.approve(actor, id, body.role);
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
}
