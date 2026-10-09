import { plainToInstance } from 'class-transformer';
import {
  HorseEnrollmentListItemDto,
  HorseEnrollmentResponseDto,
} from '../dto/horse-enrollment.dto';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import type { HorseListDisplay } from '../types/training-session.types';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toHorseEnrollmentResponse(
  row: HorseEnrollmentEntity,
): HorseEnrollmentResponseDto {
  return plainToInstance(HorseEnrollmentResponseDto, row, MAPPER_OPTIONS);
}

/**
 * Chuyển lượt ghi danh sang dòng của danh sách ghi danh, kèm tên và ảnh ngựa
 *
 * @param row Lượt ghi danh
 * @param display Tên ngựa và link ảnh đã ký
 * @returns Dòng danh sách ghi danh
 */
export function toHorseEnrollmentListItem(
  row: HorseEnrollmentEntity,
  display: HorseListDisplay,
): HorseEnrollmentListItemDto {
  return plainToInstance(
    HorseEnrollmentListItemDto,
    { ...row, ...display },
    MAPPER_OPTIONS,
  );
}
