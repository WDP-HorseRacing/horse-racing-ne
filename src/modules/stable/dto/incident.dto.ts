import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { ExamRequestStatus } from '../../medical/constants/exam-request.enum';
import { IncidentStatus } from '../constants/incident-status.enum';
import { CareTaskUserSummaryResponseDto } from './care-task.dto';

export class ReportIncidentDto {
  @ApiProperty({ format: 'uuid', description: 'Ngựa gặp sự cố' })
  @IsUUID()
  horseId!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 2000,
    description: 'Mô tả sự cố',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Khẩn: tự tạo yêu cầu khám khẩn cho bác sĩ',
  })
  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Ảnh tải lên với purpose INCIDENT_PHOTO',
  })
  @IsOptional()
  @IsUUID()
  photoMediaId?: string;
}

export class ResolveIncidentDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 1000,
    description: 'Kết quả xử lý',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  resolution!: string;
}

export class IncidentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Khu chứa ngựa' })
  @IsOptional()
  @IsUUID()
  barnId?: string;
}

export class IncidentExamRequestResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ enum: ExamRequestStatus })
  status!: ExamRequestStatus;

  @Expose()
  @ApiProperty()
  urgent!: boolean;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  handledAt!: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  dismissReason!: string | null;
}

export class IncidentResponseDto {
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
  @ApiProperty()
  description!: string;

  @Expose()
  @ApiProperty()
  urgent!: boolean;

  @Expose()
  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Link xem ảnh có hạn; null nếu không có ảnh',
  })
  photoUrl!: string | null;

  @Expose()
  @Type(() => CareTaskUserSummaryResponseDto)
  @ApiProperty({
    type: CareTaskUserSummaryResponseDto,
    description: 'Người báo',
  })
  reporter!: CareTaskUserSummaryResponseDto;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  resolution!: string | null;

  @Expose()
  @Type(() => CareTaskUserSummaryResponseDto)
  @ApiPropertyOptional({
    type: CareTaskUserSummaryResponseDto,
    nullable: true,
    description: 'Người đóng',
  })
  resolver!: CareTaskUserSummaryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: Date | null;

  @Expose()
  @Type(() => IncidentExamRequestResponseDto)
  @ApiPropertyOptional({
    type: IncidentExamRequestResponseDto,
    nullable: true,
    description: 'Yêu cầu khám gắn với sự cố, chỉ để xem',
  })
  examRequest!: IncidentExamRequestResponseDto | null;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class IncidentPageResponseDto {
  @ApiProperty({ type: [IncidentResponseDto] })
  items!: IncidentResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}
