import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import {
  MediaAssetResponseDto,
  MediaDownloadUrlResponseDto,
  MediaUploadRequestResponseDto,
  RequestUploadDto,
} from '../dto';
import { MediaService } from '../services/media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-requests')
  @ApiOperation({
    summary: 'Request time-limited private upload URL',
    description:
      'Allowed roles depend on purpose. HORSE_PHOTO: CLUB_MANAGER only; other roles get 403.',
  })
  @ApiCreatedResponse({ type: MediaUploadRequestResponseDto })
  requestUpload(@CurrentUser() actor: Actor, @Body() body: RequestUploadDto) {
    return this.mediaService.requestUpload(actor, body);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Confirm completed object upload' })
  @ApiCreatedResponse({ type: MediaAssetResponseDto })
  complete(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mediaService.complete(actor, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get media metadata',
    description:
      'Chỉ người đã tải tệp lên; người khác nhận 404. Ảnh ngựa lấy link qua GET /horses/{horseId}/photo-url.',
  })
  @ApiOkResponse({ type: MediaAssetResponseDto })
  media(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getMetadata(actor, id);
  }

  @Get(':id/download-url')
  @ApiOperation({
    summary: 'Request time-limited private download URL',
    description:
      'Chỉ người đã tải tệp lên; người khác nhận 404. Ảnh ngựa lấy link qua GET /horses/{horseId}/photo-url.',
  })
  @ApiOkResponse({ type: MediaDownloadUrlResponseDto })
  downloadUrl(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mediaService.createDownloadUrl(actor, id);
  }
}
