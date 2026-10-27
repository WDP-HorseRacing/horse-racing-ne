import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';

export class UpdateHorseLifecycleDto {
  @ApiProperty({ enum: HorseLifecycleStatus })
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus!: HorseLifecycleStatus;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description:
      'Lý do đổi vòng đời, bắt buộc. Với DECEASED là nguyên nhân mất; ngày mất do hệ thống ghi là ngày ghi nhận theo lịch câu lạc bộ',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chủ sở hữu mới, là tài khoản HORSE_OWNER đang hoạt động. Bắt buộc khi kích hoạt lại ngựa đã chuyển nhượng, không gửi ở trường hợp khác (400)',
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
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

  @ApiProperty({ description: 'Số lớp đang học mà ngựa sẽ bị rút khỏi' })
  classesWithdrawn!: number;

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

  @ApiProperty({
    description:
      'Số yêu cầu khám đang chờ sẽ tự chuyển Đã bỏ qua (chuyển nhượng)',
  })
  examRequestsDismissed!: number;

  @ApiProperty({
    description:
      'Số lịch hẹn khám định kỳ và lịch chăm sóc chưa làm sẽ bị hủy (chuyển nhượng)',
  })
  careSchedulesCancelled!: number;

  @ApiProperty({
    description:
      'Số sự cố tại chuồng đang mở sẽ tự đóng (chuyển nhượng, ghi nhận đã mất)',
  })
  incidentsClosed!: number;

  @ApiProperty({
    description:
      'Số khẩu phần đang áp dụng sẽ chuyển ARCHIVED (chuyển nhượng, ghi nhận đã mất)',
  })
  feedingPlansArchived!: number;

  @ApiProperty({
    description:
      'Số bản nháp khẩu phần sẽ bị xóa (chuyển nhượng, ghi nhận đã mất)',
  })
  draftFeedingPlansDeleted!: number;

  @ApiProperty({
    description:
      'Số việc riêng (gắn thêm hoặc miễn) đang áp dụng sẽ kết thúc ở hôm nay (chuyển nhượng, ghi nhận đã mất)',
  })
  careTasksEnded!: number;

  @ApiProperty({
    description:
      'Số việc riêng chưa tới ngày bắt đầu sẽ bị xóa (chuyển nhượng, ghi nhận đã mất)',
  })
  careTasksDeleted!: number;

  @ApiProperty({
    description:
      'true nếu checklist hôm nay còn PENDING hoặc IN_PROGRESS sẽ chuyển CANCELLED, việc đã tick giữ nguyên (chuyển nhượng, ghi nhận đã mất)',
  })
  checklistCancelled!: boolean;

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
      'Tên chủ sẽ kết thúc sở hữu (chuyển nhượng ra ngoài), null nếu giữ chủ',
  })
  ownerCleared!: string | null;

  @ApiProperty({
    description:
      'true nếu phải chọn chủ sở hữu mới (kích hoạt lại ngựa đã chuyển nhượng)',
  })
  ownerRequired!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Câu tóm tắt hệ quả, ví dụ "Winx đang có 2 lớp đang học, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ rút khỏi lớp, rút khỏi giải."; null nếu allowed = false',
  })
  summary!: string | null;
}
