import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
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
    minLength: 1,
    maxLength: 500,
    description: 'Lý do, số hợp đồng hoặc ngày ký hợp đồng, bắt buộc',
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

  @ApiProperty({
    description:
      'Thời điểm bắt đầu sở hữu, là lúc Club Manager ghi nhận gán chủ hoặc chuyển chủ',
  })
  startedAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description:
      'Thời điểm kết thúc (chuyển sang chủ khác hoặc bị bỏ trống chủ), null nếu là giai đoạn hiện tại',
  })
  endedAt!: Date | null;

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
}
