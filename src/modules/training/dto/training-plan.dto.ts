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

  @ApiProperty({
    minimum: 1,
    maximum: 14,
    description: 'Số buổi tối thiểu mỗi tuần của môn trong giai đoạn',
  })
  @IsInt()
  @Min(1)
  @Max(14)
  minSessionsPerWeek!: number;
}

export class TrainingPlanPhaseInputDto {
  @ApiProperty({
    minimum: 1,
    maximum: 52,
    description: 'Số tuần của giai đoạn',
  })
  @IsInt()
  @Min(1)
  @Max(52)
  weeks!: number;

  @ApiProperty({
    type: [TrainingPlanSubjectInputDto],
    minItems: 1,
    maxItems: 7,
    description: 'Các môn của giai đoạn, mỗi môn một dòng',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => TrainingPlanSubjectInputDto)
  subjects!: TrainingPlanSubjectInputDto[];
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
    type: [TrainingPlanPhaseInputDto],
    minItems: 1,
    maxItems: 52,
    description: 'Các giai đoạn theo thứ tự học; tổng số tuần không quá 104',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(52)
  @ValidateNested({ each: true })
  @Type(() => TrainingPlanPhaseInputDto)
  phases!: TrainingPlanPhaseInputDto[];
}

export class TrainingPlanSubjectResponseDto {
  @ApiProperty({ type: TrainingSubjectResponseDto })
  subject!: TrainingSubjectResponseDto;

  @ApiProperty({ description: 'Số buổi tối thiểu mỗi tuần' })
  minSessionsPerWeek!: number;
}

export class TrainingPlanPhaseResponseDto {
  @ApiProperty({ description: 'Thứ tự giai đoạn trong giáo án, bắt đầu từ 1' })
  position!: number;

  @ApiProperty({ description: 'Tuần bắt đầu của giai đoạn, bắt đầu từ 1' })
  startWeek!: number;

  @ApiProperty({ description: 'Số tuần của giai đoạn' })
  weeks!: number;

  @ApiProperty({
    description:
      'Thời lượng tối thiểu của giai đoạn (phút): số tuần × tổng (số buổi tối thiểu × thời lượng môn)',
  })
  minTotalMinutes!: number;

  @ApiProperty({
    type: [TrainingPlanSubjectResponseDto],
    description: 'Các môn của giai đoạn, sắp theo tên môn',
  })
  subjects!: TrainingPlanSubjectResponseDto[];
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

  @ApiProperty({
    description: 'Thời lượng tối thiểu của cả giáo án (phút)',
  })
  minTotalMinutes!: number;

  @ApiProperty({ type: [TrainingPlanPhaseResponseDto] })
  phases!: TrainingPlanPhaseResponseDto[];

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
