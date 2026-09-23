import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MANUAL_STALL_STATUSES,
  type ManualStallStatus,
  StallStatus,
} from '../constants/stall-status.enum';
import { StallType } from '../constants/stall-type.enum';

export class StallListQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo khu chuồng (Barn)',
  })
  @IsOptional()
  @IsUUID()
  barnId?: string;

  @ApiPropertyOptional({
    enum: StallStatus,
    description: 'Lọc theo trạng thái chuồng',
  })
  @IsOptional()
  @IsEnum(StallStatus)
  status?: StallStatus;

  @ApiPropertyOptional({
    enum: StallType,
    description: 'Lọc theo phân loại chuồng',
  })
  @IsOptional()
  @IsEnum(StallType)
  type?: StallType;
}

export class CreateStallDto {
  @ApiProperty({ format: 'uuid', description: 'ID khu chuồng (Barn)' })
  @IsUUID()
  barnId!: string;

  @ApiProperty({
    maxLength: 80,
    description: 'Mã số ô chuồng (duy nhất trong hệ thống)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({
    enum: StallType,
    default: StallType.STANDARD,
    description: 'Phân loại chuồng: STANDARD, ISOLATION, RECOVERY, FOALING',
  })
  @IsOptional()
  @IsEnum(StallType)
  type?: StallType;

  @ApiPropertyOptional({
    description: 'Mô tả ô chuồng, ghi chú tiện nghi cơ sở vật chất',
    type: String,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Có trang bị camera giám sát 24/7 không',
    default: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  hasCamera?: boolean;
}

export class UpdateStallDto extends PartialType(CreateStallDto) {
  @ApiPropertyOptional({
    enum: [...MANUAL_STALL_STATUSES],
    description:
      'Chỉ đổi giữa AVAILABLE và MAINTENANCE, và chỉ khi ô không có ngựa. OCCUPIED do xếp hoặc gỡ ngựa quyết',
  })
  @IsOptional()
  @IsIn(MANUAL_STALL_STATUSES)
  status?: ManualStallStatus;
}

export class StallResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  barnId!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty({ enum: StallType })
  type!: StallType;

  @Expose()
  @ApiProperty({ enum: StallStatus })
  status!: StallStatus;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @Expose()
  @ApiProperty({ type: Boolean })
  hasCamera!: boolean;
}

export class MoveHorseStallDto {
  @ApiProperty({
    format: 'uuid',
    description: 'ID ô chuồng đích, phải thuộc khu chuồng của ngựa',
  })
  @IsUUID()
  stallId!: string;
}

export class AssignedHorseSummaryDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;
}

export class StallAssignmentResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  stallId!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @Type(() => AssignedHorseSummaryDto)
  @ApiPropertyOptional({ type: AssignedHorseSummaryDto, nullable: true })
  horse?: AssignedHorseSummaryDto | null;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  startAt!: Date;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  endAt!: Date | null;
}
