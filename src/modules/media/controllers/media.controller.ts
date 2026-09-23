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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { RequestUploadDto } from '../dto/request-upload.dto';

@ApiTags('media')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('media')
export class MediaController extends PendingApi {
  @Post('upload-requests')
  @ApiOperation({ summary: 'Request time-limited private upload URL' })
  requestUpload(@CurrentUser() _actor: Actor, @Body() _body: RequestUploadDto) {
    return this.pending();
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Confirm completed object upload' })
  complete(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media metadata' })
  media(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Request time-limited private download URL' })
  downloadUrl(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }
}
