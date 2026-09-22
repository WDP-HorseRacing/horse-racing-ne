import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StallStatus } from '../constants/stall-status.enum';
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
    enum: StallStatus,
    default: StallStatus.AVAILABLE,
    description: 'Trạng thái ô chuồng',
  })
  @IsOptional()
  @IsEnum(StallStatus)
  status?: StallStatus;

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

export class UpdateStallDto extends PartialType(CreateStallDto) {}

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

export class CreateStallAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'ID ngựa' })
  @IsUUID()
  horseId!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Thời điểm bắt đầu xếp chuồng',
  })
  @IsDateString()
  startAt!: string;
}

export class AssignedHorseSummaryDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;
}

export class AssignedGroomSummaryDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;

  @Expose()
  @ApiProperty()
  email!: string;
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
