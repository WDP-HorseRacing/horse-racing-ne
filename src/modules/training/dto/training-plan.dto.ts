import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TrainingSubjectResponseDto } from './training-subject.dto';

export class TrainingPlanSubjectInputDto {
  @ApiProperty({ format: 'uuid', description: 'Môn học' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ minimum: 1, maximum: 52, description: 'Số tuần học môn này' })
  @IsInt()
  @Min(1)
  @Max(52)
  weeks!: number;
}

export class SaveTrainingPlanDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ description: 'Mục tiêu, mô tả giáo án' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: [TrainingPlanSubjectInputDto],
    minItems: 1,
    maxItems: 52,
    description: 'Các môn theo thứ tự học',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(52)
  @ValidateNested({ each: true })
  @Type(() => TrainingPlanSubjectInputDto)
  subjects!: TrainingPlanSubjectInputDto[];
}

export class TrainingPlanSubjectResponseDto {
  @ApiProperty({ description: 'Thứ tự trong giáo án, bắt đầu từ 1' })
  position!: number;

  @ApiProperty({ description: 'Tuần bắt đầu học môn, bắt đầu từ 1' })
  startWeek!: number;

  @ApiProperty({ description: 'Số tuần học môn' })
  weeks!: number;

  @ApiProperty({ type: TrainingSubjectResponseDto })
  subject!: TrainingSubjectResponseDto;
}

export class TrainingPlanResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'uuid', description: 'Head Trainer sở hữu giáo án' })
  headTrainerId!: string;

  @ApiProperty({ description: 'Tổng số tuần của giáo án' })
  totalWeeks!: number;

  @ApiProperty({ type: [TrainingPlanSubjectResponseDto] })
  subjects!: TrainingPlanSubjectResponseDto[];

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
