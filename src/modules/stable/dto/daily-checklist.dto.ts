import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import { CareTaskUserSummaryResponseDto } from './care-task.dto';

export class DailyChecklistQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'Từ ngày, mặc định hôm nay',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Đến ngày, mặc định bằng from; tối đa 31 ngày',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class TickChecklistItemDto {
  @ApiProperty({ description: 'true là đã xong, false là gỡ tick' })
  @IsBoolean()
  done!: boolean;

  @ApiPropertyOptional({
    maxLength: 200,
    nullable: true,
    description: 'Ghi chú; gửi null để xóa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class DailyChecklistItemResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  taskTypeId!: string;

  @Expose()
  @ApiProperty({ description: 'Tên việc' })
  name!: string;

  @Expose()
  @ApiProperty({ description: 'Đã xong' })
  done!: boolean;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  doneAt!: Date | null;

  @Expose()
  @Type(() => CareTaskUserSummaryResponseDto)
  @ApiPropertyOptional({
    type: CareTaskUserSummaryResponseDto,
    nullable: true,
    description: 'Người tick',
  })
  doer!: CareTaskUserSummaryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  note!: string | null;
}

export class DailyChecklistResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty({ description: 'Tên ngựa' })
  horseName!: string;

  @Expose()
  @ApiProperty({ format: 'date' })
  checklistDate!: string;

  @Expose()
  @ApiProperty({ enum: DailyChecklistStatus })
  status!: DailyChecklistStatus;

  @Expose()
  @Type(() => CareTaskUserSummaryResponseDto)
  @ApiProperty({ type: CareTaskUserSummaryResponseDto, description: 'Groom' })
  groom!: CareTaskUserSummaryResponseDto;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @Expose()
  @Type(() => DailyChecklistItemResponseDto)
  @ApiProperty({ type: [DailyChecklistItemResponseDto] })
  items!: DailyChecklistItemResponseDto[];
}
