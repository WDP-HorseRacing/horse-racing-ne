import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';

export class UpdateHorseHealthDto {
  @ApiProperty({ enum: HorseHealthStatus })
  @IsEnum(HorseHealthStatus)
  healthStatus!: HorseHealthStatus;
}
export class UpdateHorseLifecycleDto {
  @ApiProperty({ enum: HorseLifecycleStatus })
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus!: HorseLifecycleStatus;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do đổi vòng đời, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
export class LifecyclePreviewQueryDto {
  @ApiProperty({ enum: HorseLifecycleStatus })
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus!: HorseLifecycleStatus;
}
export class HorseLifecyclePreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ enum: HorseLifecycleStatus })
  from!: HorseLifecycleStatus;

  @ApiProperty({ enum: HorseLifecycleStatus })
  to!: HorseLifecycleStatus;

  @ApiProperty({
    description: 'false nếu không được chuyển giữa hai trạng thái',
  })
  allowed!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do không được đổi, null nếu allowed = true',
  })
  blockedReason!: string | null;

  @ApiProperty({ description: 'Số giáo án đang mở sẽ bị hủy' })
  trainingPlansCancelled!: number;

  @ApiProperty({ description: 'Số đăng ký thi đấu chưa diễn ra sẽ bị rút' })
  raceRegistrationsWithdrawn!: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Mã ô chuồng sẽ được trả về trống, null nếu không trả ô',
  })
  stallReleased!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Tên Groom sẽ kết thúc phân công, null nếu không đổi',
  })
  groomEnded!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Tên khu sẽ bị bỏ, null nếu giữ khu',
  })
  barnCleared!: string | null;

  @ApiProperty({
    description: 'true nếu lệnh khóa huấn luyện đang mở sẽ tự gỡ',
  })
  trainingLockReleased!: boolean;

  @ApiPropertyOptional({
    enum: HorseHealthStatus,
    nullable: true,
    description: 'Sức khỏe sẽ được đặt về giá trị này, null nếu giữ nguyên',
  })
  healthResetTo!: HorseHealthStatus | null;

  @ApiProperty({
    description:
      'true nếu sau khi đổi, ngựa vào danh sách Chờ xếp khu (kích hoạt lại ngựa đã chuyển nhượng)',
  })
  pendingBarnAfter!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Tên chủ sẽ bị bỏ trống vì tài khoản không còn là chủ ngựa đang hoạt động, null nếu giữ chủ',
  })
  ownerCleared!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Câu tóm tắt để hiện ở bảng xác nhận, ví dụ "Winx đang có 2 giáo án huấn luyện đang mở, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ hủy giáo án, rút khỏi giải."; null nếu allowed = false',
  })
  summary!: string | null;
}
