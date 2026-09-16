import {
  Body,
  Controller,
  Get,
  Param,
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
import { Access, CurrentUser } from '../../common/decorators';
import { PaginationResponseDto } from '../../common/dto/pagination-response.dto';
import type { Actor } from '../../common/types/actor';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UsersService } from './services/users.service';
import { UserRole } from './user.enums';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
