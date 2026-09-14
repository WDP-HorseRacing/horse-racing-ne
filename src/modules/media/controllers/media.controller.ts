import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';
import { RequestUploadDto } from '../dto/request-upload.dto';

@ApiTags('media')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('media')
export class MediaController extends PendingApi {
  @Post('upload-requests')
  @ApiOperation({ summary: 'Request time-limited private upload URL' })
  requestUpload(@Body() _body: RequestUploadDto) {
    return this.pending();
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Confirm completed object upload' })
  complete(@Param('id') _id: string) {
    return this.pending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media metadata' })
  media(@Param('id') _id: string) {
    return this.pending();
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Request time-limited private download URL' })
  downloadUrl(@Param('id') _id: string) {
    return this.pending();
  }
}
