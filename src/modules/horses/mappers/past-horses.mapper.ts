import type {
  HorsePedigreeNodeResponseDto,
  PastHorseDetailDto,
  PastHorseListItemDto,
} from '../dto';
import type { PastOwnershipRow } from '../types/horse.types';

/**
 * Gom các giai đoạn sở hữu đã kết thúc theo từng con ngựa
 *
 * - Thứ tự ngựa theo giai đoạn kết thúc gần nhất của con đó; giai đoạn trong mỗi ngựa giữ thứ tự của rows
 *
 * @param rows Các giai đoạn, mới nhất trước
 * @param photoUrls Map từ mã ảnh sang link tải ảnh
 * @returns Mỗi con ngựa một dòng kèm các khoảng đã sở hữu
 */
export function toPastHorseList(
  rows: PastOwnershipRow[],
  photoUrls: Map<string, string>,
): PastHorseListItemDto[] {
  const byHorse = new Map<string, PastHorseListItemDto>();
  for (const row of rows) {
    const item = byHorse.get(row.horseId) ?? {
      horseId: row.horseId,
      name: row.name,
      photoUrl: row.mediaId ? (photoUrls.get(row.mediaId) ?? null) : null,
      periods: [],
    };
    item.periods.push({ startedAt: row.startedAt, endedAt: row.endedAt });
    byHorse.set(row.horseId, item);
  }
  return [...byHorse.values()];
}

/**
 * Dựng thông tin cơ bản của một con ngựa cho chủ cũ
 *
 * @param rows Các giai đoạn người gọi từng sở hữu con ngựa, mới nhất trước, ít nhất một dòng
 * @param photoUrl Link tải ảnh đại diện, null nếu không có
 * @param ancestors Cha mẹ và ông bà, chỉ có tên
 * @returns Tên, ảnh, giới tính, ngày sinh, màu lông, phả hệ và các khoảng đã sở hữu
 */
export function toPastHorseDetail(
  rows: PastOwnershipRow[],
  photoUrl: string | null,
  ancestors: HorsePedigreeNodeResponseDto[],
): PastHorseDetailDto {
  const [first] = rows;
  return {
    horseId: first.horseId,
    name: first.name,
    photoUrl,
    gender: first.gender,
    dateOfBirth: first.dateOfBirth,
    color: first.color,
    ancestors,
    periods: rows.map((row) => ({
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    })),
  };
}
