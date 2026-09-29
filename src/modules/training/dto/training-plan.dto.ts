import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';

export function IsAfterOrEqual(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAfterOrEqual',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const relatedPropertyName = args.constraints[0] as string;
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];
          if (typeof value !== 'string' || typeof relatedValue !== 'string') {
            return true;
          }
          return value.slice(0, 10) >= relatedValue.slice(0, 10);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} phải lớn hơn hoặc bằng ${args.constraints[0]}`;
        },
      },
    });
  };
}

export class CreateTrainingPlanDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Được lấy từ route nếu bỏ trống' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  phaseName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  goal!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  @IsAfterOrEqual('startDate', {
    message: 'endDate phải lớn hơn hoặc bằng startDate',
  })
  endDate!: string;
}

export class UpdateTrainingPlanDto extends PartialType(CreateTrainingPlanDto) {}

export class CancelTrainingPlanDto {
  @ApiProperty({ minLength: 1, description: 'Lý do hủy kế hoạch huấn luyện' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class TrainingPlanResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  classId!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  createdBy!: string;

  @ApiProperty()
  @Expose()
  phaseName!: string;

  @ApiPropertyOptional({ description: 'Không có key khi caller là Groom' })
  @Expose()
  goal?: string;

  @ApiProperty({ format: 'date' })
  @Expose()
  startDate!: string;

  @ApiProperty({ format: 'date' })
  @Expose()
  endDate!: string;

  @ApiProperty({ enum: TrainingPlanStatus })
  @Expose()
  status!: TrainingPlanStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  activatedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  completedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  cancelledAt!: Date | null;

  @ApiPropertyOptional()
  @Expose()
  cancelReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}
