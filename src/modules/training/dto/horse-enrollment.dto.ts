import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';

export class CreateHorseEnrollmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  horseId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  enrolledAt?: string;
}

export class LeaveHorseEnrollmentDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  leftAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

export class HorseEnrollmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  classId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  horseId!: string;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  enrolledAt!: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  leftAt!: Date | null;

  @ApiProperty({ enum: HorseEnrollmentStatus })
  @Expose()
  status!: HorseEnrollmentStatus;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}
