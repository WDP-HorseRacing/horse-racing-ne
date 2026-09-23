import { ApiProperty } from '@nestjs/swagger';

export class MediaAssetResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  uploadedBy!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  byteSize!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class MediaUploadRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  assetId!: string;

  @ApiProperty({
    description: 'Presigned URL, client gửi PUT thân tệp lên đây',
  })
  uploadUrl!: string;

  @ApiProperty({ example: 'PUT' })
  method!: 'PUT';

  @ApiProperty({
    description:
      'Header bắt buộc phải gửi kèm khi PUT, phải khớp số liệu đã khai báo',
    example: { 'Content-Type': 'image/jpeg', 'Content-Length': '102400' },
  })
  headers!: Record<string, string>;
}

export class MediaDownloadUrlResponseDto {
  @ApiProperty({ description: 'Presigned URL để GET tệp, có hạn dùng' })
  url!: string;
}
