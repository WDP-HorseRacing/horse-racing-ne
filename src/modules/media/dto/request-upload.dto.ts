import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MediaPurpose } from '../enums/media-purpose.enum';

export class RequestUploadDto {
  @ApiProperty({ enum: MediaPurpose, enumName: 'MediaPurpose' })
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  mimeType!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  byteSize!: number;
}
