import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';

export class AssignParticipantGroomDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  groomId?: string | null;
}

export class MarkParticipantAbsentDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class CancelParticipantDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class SessionParticipantResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  horseEnrollmentId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Expose()
  assignedGroomId!: string | null;

  @ApiProperty({ enum: SessionParticipantStatus })
  @Expose()
  status!: SessionParticipantStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  checkedInAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  startedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  completedAt!: Date | null;

  @ApiPropertyOptional()
  @Expose()
  absenceReason!: string | null;

  @ApiPropertyOptional()
  @Expose()
  cancelReason!: string | null;

  @ApiPropertyOptional()
  @Expose()
  ineligibilityReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}

export class SessionParticipantListItemDto extends SessionParticipantResponseDto {
  @ApiProperty({
    description:
      'Ngựa đang có lệnh khóa huấn luyện hiệu lực, tính tại lúc đọc. Lượt còn mở sẽ bị chặn khi bắt đầu buổi',
  })
  @Expose()
  trainingLocked!: boolean;
}
