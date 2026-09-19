import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { IncidentStatus } from '../constants/incident-status.enum';

export class ReportIncidentDto {
  @ApiProperty({ format: 'uuid', description: 'ID ngựa gặp sự cố' })
  @IsUUID()
  horseId!: string;

  @ApiProperty({ description: 'Mô tả chi tiết sự cố' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiPropertyOptional({ default: false, description: 'Mức độ khẩn cấp' })
  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Hình ảnh/video đính kèm (nếu có)' })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;
}

export class UpdateIncidentStatusDto {
  @ApiProperty({ enum: IncidentStatus, description: 'Trạng thái xử lý sự cố' })
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;
}
