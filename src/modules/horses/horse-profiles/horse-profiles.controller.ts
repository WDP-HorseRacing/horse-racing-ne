import {
  Body,
  Controller,
  Delete,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  ActivateReferenceHorseDto,
  CreateHorseDto,
  DeleteHorseDto,
  HorseDetailResponseDto,
  HorseEligibilityResponseDto,
  HorseListItemDto,
  HorseListQueryDto,
  HorsePedigreeResponseDto,
  HorsePermissionsResponseDto,
  HorseResponseDto,
  UpdateHorseDto,
} from '../dto/horse.dto';
import { ALL_ROLES } from '../constants/horse.constants';
import { HorseProfilesService } from './horse-profiles.service';
@ApiTags('horses')
@ApiBearerAuth()
@Controller()
export class HorseProfilesController {
  constructor(private readonly profilesService: HorseProfilesService) {}

  @Access(ALL_ROLES)
  @Get('horses')
  @ApiOperation({
    summary: 'List horses visible to the current user',
    description:
      'Club Manager, Head Trainer, Veterinarian, Groom: whole club. Horse Owner: horses currently owned.',
  })
  @ApiOkResponse({ type: PaginationResponseDto })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseListItemDto>> {
    return this.profilesService.list(actor, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('horses')
  @ApiOperation({ summary: 'Create horse profile' })
  @ApiCreatedResponse({ type: HorseResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Body() body: CreateHorseDto,
  ): Promise<HorseResponseDto> {
    return this.profilesService.create(actor, body);
  }

  @Access(ALL_ROLES)
  @Get('horses/:id')
  @ApiOperation({
    summary: 'Get horse profile detail',
    description:
      'Phần đầu hồ sơ. Groom không nhận sireId/damId; Veterinarian và Groom không nhận representativeOwner. Chỉ Club Manager mở được ngựa tham chiếu và hồ sơ đã xóa. Quyền thao tác lấy ở GET /horses/{id}/permissions.',
  })
  @ApiOkResponse({ type: HorseDetailResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HorseDetailResponseDto> {
    return this.profilesService.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Patch('horses/:id')
  @ApiOperation({
    summary: 'Update horse profile and pedigree parents',
    description:
      'Club Manager sửa toàn bộ. Head Trainer chỉ gửi được raceAptitude (kèm version) cho ngựa ở khu mình phụ trách, gửi field khác trả 403. Bắt buộc gửi version lấy từ GET; người khác đã lưu trước trả 409, cần GET lại. Ngựa đã chuyển nhượng trả 409, hồ sơ đã xóa trả 404.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    return this.profilesService.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete('horses/:id')
  @ApiOperation({
    summary: 'Soft-delete a horse profile created by mistake',
    description:
      'A reason is required. Rejected when the horse is a pedigree parent or has any business data (medical, training, racing, ownership, stall, measurements...); change its lifecycle status instead.',
  })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeleteHorseDto,
  ): Promise<void> {
    return this.profilesService.remove(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('horses/:horseId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a reference horse as a club horse',
    description:
      'Dùng khi CLB mua lại ngựa tham chiếu. Chỉ đi một chiều: isReference=false, vòng đời ACTIVE, sức khỏe ELIGIBLE. Gửi kèm stallId, owners nếu muốn xếp chuồng, gán chủ luôn. Bắt buộc gửi version lấy từ GET; ngựa không phải tham chiếu hoặc version cũ trả 409.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  activate(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: ActivateReferenceHorseDto,
  ): Promise<HorseResponseDto> {
    return this.profilesService.activate(actor, horseId, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/pedigree')
  @ApiOperation({ summary: 'Get horse pedigree up to 4 generations' })
  @ApiQuery({
    name: 'depth',
    required: false,
    schema: { minimum: 1, maximum: 4, default: 2 },
  })
  @ApiOkResponse({ type: HorsePedigreeResponseDto })
  pedigree(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query('depth') depth?: string,
  ): Promise<HorsePedigreeResponseDto> {
    return this.profilesService.getPedigree(actor, horseId, depth);
  }

  @Access(ALL_ROLES)
  @Get('horses/:horseId/permissions')
  @ApiOperation({
    summary: 'Get what the current user can do on this horse profile',
    description:
      'Chỉ để client ẩn/hiện nút và tab. Các API ghi vẫn tự kiểm tra quyền.',
  })
  @ApiOkResponse({ type: HorsePermissionsResponseDto })
  permissions(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorsePermissionsResponseDto> {
    return this.profilesService.getPermissions(actor, horseId);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/eligibility')
  @ApiOperation({ summary: 'Get current training and racing eligibility' })
  @ApiOkResponse({ type: HorseEligibilityResponseDto })
  eligibility(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseEligibilityResponseDto> {
    return this.profilesService.getEligibility(actor, horseId);
  }
}
