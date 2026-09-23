import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../enums/horse-measurement-alert.enum';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';

export class HorseMeasurementValueDto {
  @ApiProperty({ enum: HorseMeasurementType })
  @IsEnum(HorseMeasurementType)
  type!: HorseMeasurementType;

  @ApiProperty({
    description:
      'Đơn vị cố định theo loại: WEIGHT kg (30–1500), HEIGHT cm (50–250), BODY_CONDITION điểm (1–9), TEMPERATURE °C (30–45)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  value!: number;
}

export class CreateHorseMeasurementDto {
  @ApiProperty({
    type: [HorseMeasurementValueDto],
    description:
      'Một hoặc nhiều loại chỉ số của cùng một lần đo, mỗi loại tối đa một giá trị',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => HorseMeasurementValueDto)
  values!: HorseMeasurementValueDto[];

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Mặc định là thời điểm hiện tại. Không ở tương lai, lùi tối đa 7 ngày',
  })
  @IsOptional()
  @IsDateString()
  measuredAt?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Bắt buộc true khi có giá trị ngoài khoảng bình thường; không gửi thì API trả 422 để giao diện hỏi xác nhận',
  })
  @IsOptional()
  @IsBoolean()
  confirmAbnormal: boolean = false;
}

export class DeleteHorseMeasurementDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do xóa bản ghi đo sai, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class HorseMeasurementListQueryDto {
  @ApiPropertyOptional({ enum: HorseMeasurementType })
  @IsOptional()
  @IsEnum(HorseMeasurementType)
  type?: HorseMeasurementType;
}

export class HorseLatestMeasurementDto {
  @ApiProperty({ enum: HorseMeasurementType })
  type!: HorseMeasurementType;

  @ApiProperty({ example: '512.50' })
  value!: string;

  @ApiProperty({ example: 'kg' })
  unit!: string;

  @ApiProperty({ format: 'date-time' })
  measuredAt!: Date;

  @ApiProperty({
    description:
      'Ngoài khoảng bình thường: WEIGHT 400–600 kg, HEIGHT 150–175 cm, BODY_CONDITION 4–6, TEMPERATURE 37.2–38.3 °C',
  })
  isAbnormal!: boolean;
}

export class HorseMeasurementResponseDto extends HorseLatestMeasurementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  measuredBy!: string;

  @ApiProperty()
  measuredByName!: string;

  @ApiProperty({
    enum: HorseMeasurementSource,
    description:
      'MANUAL: nhập tay ở hồ sơ ngựa. MEDICAL_EXAM: ghi từ buổi khám, không xóa được ở đây',
  })
  source!: HorseMeasurementSource;
}

export class HorseMeasurementAlertDto {
  @ApiProperty({ enum: HorseMeasurementAlert })
  alert!: HorseMeasurementAlert;

  @ApiProperty({ enum: HorseMeasurementAlertSeverity })
  severity!: HorseMeasurementAlertSeverity;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Chỉ có với WEIGHT_DROP: cân nặng cao nhất trong 14 ngày trước thời điểm đo; null với FEVER',
  })
  baselineValue!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Chỉ có với WEIGHT_DROP: phần trăm giảm so với baselineValue; null với FEVER',
  })
  dropPercent!: number | null;
}

export class CreatedHorseMeasurementResponseDto extends HorseMeasurementResponseDto {
  @ApiProperty({
    type: [HorseMeasurementAlertDto],
    description:
      'Cảnh báo tự động sinh ra từ lần ghi này (sốt > 38.6 °C, cân nặng giảm > 5% trong 14 ngày); rỗng nếu không có',
  })
  alerts!: HorseMeasurementAlertDto[];
}
