import { ApiProperty } from '@nestjs/swagger';
import { TrainingLockStatus } from '../constants/training-lock.enum';

/**
 * Một lệnh khóa huấn luyện.
 */
export class TrainingLockResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  caseId!: string | null;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: 'date-time' })
  lockStart!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  lockEnd!: Date | null;

  @ApiProperty({ enum: TrainingLockStatus })
  status!: TrainingLockStatus;

  @ApiProperty({ format: 'uuid' })
  lockedBy!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'null khi hệ thống tự gỡ (xem releasedBySystem)',
  })
  releasedBy!: string | null;

  @ApiProperty({
    description: 'True khi hệ thống tự gỡ, ví dụ do chuyển nhượng',
  })
  releasedBySystem!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  releasedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  releaseConclusion!: string | null;
}
