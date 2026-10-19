import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsDateOnly, trimValue } from '../../../common/utils/dto-input';
import { HorseCareTaskMode } from '../constants/horse-care-task-mode.enum';

export class CreateCareTaskTypeDto {
  @ApiProperty({ maxLength: 80, description: 'Tên loại việc, duy nhất' })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ description: 'Áp cho mọi ngựa mỗi ngày' })
  @IsBoolean()
  appliesToAll!: boolean;
}

export class UpdateCareTaskTypeDto {
  @ApiPropertyOptional({
    maxLength: 80,
    description: 'Tên loại việc, duy nhất',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: 'Áp cho mọi ngựa mỗi ngày' })
  @IsOptional()
  @IsBoolean()
  appliesToAll?: boolean;

  @ApiPropertyOptional({
    description:
      'Đang dùng; ngưng thì từ ngày sau không còn sinh vào checklist',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateHorseCareTaskDto {
  @ApiProperty({ format: 'uuid', description: 'Loại việc' })
  @IsUUID()
  taskTypeId!: string;

  @ApiPropertyOptional({
    enum: HorseCareTaskMode,
    default: HorseCareTaskMode.EXTRA,
    description:
      'EXTRA: gắn thêm loại việc không áp mọi ngựa. EXEMPT: miễn loại việc đang áp mọi ngựa, bắt buộc ghi lý do ở note',
  })
  @IsOptional()
  @IsEnum(HorseCareTaskMode)
  mode?: HorseCareTaskMode;

  @ApiProperty({ format: 'date', description: 'Ngày bắt đầu, từ hôm nay' })
  @IsDateOnly({
    message: 'Ngày bắt đầu phải có dạng YYYY-MM-DD',
  })
  fromDate!: string;

  @ApiProperty({ format: 'date', description: 'Ngày kết thúc' })
  @IsDateOnly({
    message: 'Ngày kết thúc phải có dạng YYYY-MM-DD',
  })
  toDate!: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Ghi chú cho Groom; với EXEMPT là lý do miễn (bắt buộc)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CareTaskTypeResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  appliesToAll!: boolean;

  @Expose()
  @ApiProperty()
  active!: boolean;
}

export class CareTaskUserSummaryResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;
}

export class HorseCareTaskResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @Type(() => CareTaskTypeResponseDto)
  @ApiProperty({ type: CareTaskTypeResponseDto })
  taskType!: CareTaskTypeResponseDto;

  @Expose()
  @ApiProperty({
    enum: HorseCareTaskMode,
    description: 'EXTRA: gắn thêm. EXEMPT: miễn việc chung',
  })
  mode!: HorseCareTaskMode;

  @Expose()
  @ApiProperty({ format: 'date' })
  fromDate!: string;

  @Expose()
  @ApiProperty({ format: 'date' })
  toDate!: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  note!: string | null;

  @Expose()
  @Type(() => CareTaskUserSummaryResponseDto)
  @ApiProperty({
    type: CareTaskUserSummaryResponseDto,
    description: 'Người gắn',
  })
  creator!: CareTaskUserSummaryResponseDto;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
