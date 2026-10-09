import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
    type: [Number],
    minItems: 1,
    maxItems: 7,
    description:
      'Các thứ học môn này theo ISO: 1 là thứ Hai, 7 là Chủ nhật; trong một giai đoạn mỗi thứ chỉ thuộc một môn',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];
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

  @ApiProperty({
    type: [Number],
    description:
      'Các thứ học môn theo ISO (1 là thứ Hai, 7 là Chủ nhật), tăng dần',
  })
  weekdays!: number[];
}

export class TrainingPlanPhaseResponseDto {
  @ApiProperty({ description: 'Thứ tự giai đoạn trong giáo án, bắt đầu từ 1' })
  position!: number;

  @ApiProperty({ description: 'Tuần bắt đầu của giai đoạn, bắt đầu từ 1' })
  startWeek!: number;

  @ApiProperty({ description: 'Số tuần của giai đoạn' })
  weeks!: number;

  @ApiProperty({
    type: [TrainingPlanSubjectResponseDto],
    description: 'Các môn của giai đoạn, sắp theo thứ nhỏ nhất trong tuần',
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

  @ApiProperty({ type: [TrainingPlanPhaseResponseDto] })
  phases!: TrainingPlanPhaseResponseDto[];

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
