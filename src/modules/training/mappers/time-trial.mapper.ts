import { plainToInstance } from 'class-transformer';
import { TimeTrialResponseDto } from '../dto/time-trial.dto';
import { TimeTrialEntity } from '../entities/time-trial.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển cấu hình chạy thử sang dữ liệu trả về
 *
 * - Cự ly và thời gian mục tiêu trả về dạng số
 * - Không có thời gian mục tiêu: targetTimeMs là null
 *
 * @param row Cấu hình chạy thử đọc từ DB
 * @returns Cấu hình chạy thử với các giá trị số
 */
export function toTimeTrialResponse(
  row: TimeTrialEntity,
): TimeTrialResponseDto {
  const dto = plainToInstance(TimeTrialResponseDto, row, MAPPER_OPTIONS);
  dto.distanceM = Number(row.distanceM);
  dto.targetTimeMs =
    row.targetTimeMs === null ? null : Number(row.targetTimeMs);
  return dto;
}
