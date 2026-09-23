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
import { Access, CurrentUser } from '../../../common/decorators';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreateHorseDto,
  HorseDetailResponseDto,
  HorseEligibilityResponseDto,
  HorseListItemDto,
  HorseListPageDto,
  HorseListQueryDto,
  HorsePedigreeResponseDto,
  HorsePermissionsResponseDto,
  HorsePhotoUrlResponseDto,
  HorseResponseDto,
  UpdateHorseDto,
} from '../dto';
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
      'Club Manager, Head Trainer, Veterinarian, Groom: toàn câu lạc bộ. Horse Owner: ngựa mình sở hữu. Mặc định bỏ hồ sơ đã xóa và xếp ngựa chấn thương/cách ly lên đầu. Chỉ Club Manager bật được includeDeleted.',
  })
  @ApiOkResponse({ type: HorseListPageDto })
  listHorses(
    @CurrentUser() actor: Actor,
    @Query() query: HorseListQueryDto,
  ): Promise<PaginationResponseDto<HorseListItemDto>> {
    return this.profilesService.list(actor, query);
  }

  @Access([UserRole.HORSE_OWNER])
  @Get('owners/me/horses')
  @ApiOperation({ summary: 'List horses owned by the current user' })
  @ApiOkResponse({ type: [HorseResponseDto] })
  listMyHorses(@CurrentUser() actor: Actor): Promise<HorseResponseDto[]> {
    return this.profilesService.listMyHorses(actor);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('horses')
  @ApiOperation({
    summary: 'Create horse profile',
    description:
      'Nhập luôn được ảnh, cha mẹ và chủ sở hữu, hoặc để trống bổ sung sau. Sức khỏe luôn ELIGIBLE, vòng đời luôn ACTIVE.',
  })
  @ApiCreatedResponse({ type: HorseResponseDto })
  createHorse(
    @CurrentUser() actor: Actor,
    @Body() body: CreateHorseDto,
  ): Promise<HorseResponseDto> {
    return this.profilesService.create(actor, body);
  }

  @Access(ALL_ROLES)
  @Get('horses/:horseId')
  @ApiOperation({
    summary: 'Get horse profile detail',
    description:
      'Tab thông tin hồ sơ: mọi vai trò nhận cùng nhóm thông tin, kèm được tập/được đua và lý do. Horse Owner không nhận id khu và ô. Chỉ Club Manager mở được hồ sơ đã xóa, vai trò khác nhận 404. Quyền thao tác lấy ở GET /horses/{id}/permissions.',
  })
  @ApiOkResponse({ type: HorseDetailResponseDto })
  getHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseDetailResponseDto> {
    return this.profilesService.get(actor, horseId);
  }

  @Access(ALL_ROLES)
  @Get('horses/:horseId/photo-url')
  @ApiOperation({
    summary: 'Get a time-limited download URL of the horse photo',
    description:
      'Ai xem được hồ sơ ngựa thì lấy được link ảnh. Ngựa chưa có ảnh hoặc nằm ngoài phạm vi xem trả 404.',
  })
  @ApiOkResponse({ type: HorsePhotoUrlResponseDto })
  getPhotoUrl(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorsePhotoUrlResponseDto> {
    return this.profilesService.getPhotoUrl(actor, horseId);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Patch('horses/:horseId')
  @ApiOperation({
    summary: 'Update horse profile, parents and owner',
    description:
      'Club Manager sửa định danh, ảnh, cha mẹ, chủ sở hữu (ownerId, null để bỏ trống). Head Trainer chỉ gửi được raceAptitude cho ngựa ở khu mình phụ trách. Gửi field ngoài quyền trả 403. Bắt buộc gửi version lấy từ GET; người khác đã lưu trước trả 409, cần GET lại. Ngựa đã chuyển nhượng trả 409. Hồ sơ đã xóa: Club Manager nhận 403 (phải khôi phục trước), Head Trainer nhận 404.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  updateHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseDto,
  ): Promise<HorseResponseDto> {
    return this.profilesService.update(actor, horseId, body);
  }

  @Access(ALL_ROLES)
  @Get('horses/:horseId/pedigree')
  @ApiOperation({
    summary: 'Get horse pedigree: parents and grandparents',
    description:
      'Chỉ gồm ngựa có hồ sơ tại câu lạc bộ. Horse Owner chỉ mở được tổ tiên mình sở hữu (canOpen).',
  })
  @ApiOkResponse({ type: HorsePedigreeResponseDto })
  getPedigree(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorsePedigreeResponseDto> {
    return this.profilesService.getPedigree(actor, horseId);
  }

  @Access(ALL_ROLES)
  @Get('horses/:horseId/permissions')
  @ApiOperation({
    summary: 'Get what the current user can do on this horse profile',
    description:
      'Chỉ để client ẩn/hiện nút và tab. Các API ghi vẫn tự kiểm tra quyền.',
  })
  @ApiOkResponse({ type: HorsePermissionsResponseDto })
  getPermissions(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorsePermissionsResponseDto> {
    return this.profilesService.getPermissions(actor, horseId);
  }

  @Access(ALL_ROLES)
  @Get('horses/:horseId/eligibility')
  @ApiOperation({ summary: 'Get current training and racing eligibility' })
  @ApiOkResponse({ type: HorseEligibilityResponseDto })
  getEligibility(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseEligibilityResponseDto> {
    return this.profilesService.getEligibility(actor, horseId);
  }
}
