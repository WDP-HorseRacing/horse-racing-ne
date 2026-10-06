import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { HorsePersonDto } from './horse.dto';

export class CreateOwnershipTransferDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Chủ mới, là tài khoản HORSE_OWNER đang hoạt động',
  })
  @IsUUID()
  newOwnerId!: string;

  @ApiProperty({
    format: 'date',
    description:
      'Ngày hiệu lực trên hợp đồng. Không ở tương lai, không trước ngày bắt đầu sở hữu của chủ hiện tại',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveDate must be in YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  effectiveDate!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do hoặc số hợp đồng, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({
    minimum: 1,
    description:
      'version của hồ sơ lấy từ lần GET gần nhất. Người khác đã lưu trước thì trả 409, cần GET lại',
  })
  @IsInt()
  @Min(1)
  version!: number;
}

export class HorseOwnershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: HorsePersonDto })
  owner!: HorsePersonDto;

  @ApiProperty({ format: 'date', description: 'Ngày bắt đầu sở hữu' })
  effectiveDate!: string;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Ngày kết thúc: ngày hiệu lực của giai đoạn kế tiếp, hoặc ngày bị bỏ trống chủ; null nếu là giai đoạn hiện tại',
  })
  endDate!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do hoặc số hợp đồng, null với giai đoạn tạo tự động',
  })
  reason!: string | null;

  @ApiPropertyOptional({
    type: HorsePersonDto,
    nullable: true,
    description: 'Người ghi nhận, null với dữ liệu chuyển đổi',
  })
  recordedBy!: HorsePersonDto | null;

  @ApiProperty({ description: 'Thời điểm ghi nhận trên hệ thống' })
  recordedAt!: Date;
}
