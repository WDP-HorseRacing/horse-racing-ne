import { plainToInstance } from 'class-transformer';
import { TrialResultResponseDto } from '../dto/time-trial.dto';
import { TrialResultEntity } from '../entities/trial-result.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển một lần chạy thử sang dữ liệu trả về
 *
 * @param row Lần chạy thử đọc từ DB
 * @param videoUrl Link xem video có hạn, null nếu lần chạy không có video
 * @returns Lần chạy thử kèm videoUrl
 */
export function toTrialResultResponse(
  row: TrialResultEntity,
  videoUrl: string | null,
): TrialResultResponseDto {
  const dto = plainToInstance(TrialResultResponseDto, row, MAPPER_OPTIONS);
  dto.videoUrl = videoUrl;
  return dto;
}
