import type {
  HorseBrief,
  HorseListDisplay,
} from '../types/training-session.types';

/**
 * Ghép tên ngựa với link ảnh đã ký cho một dòng danh sách
 *
 * - Ngựa không có trong briefs: tên rỗng, ảnh null
 * - Ngựa không có ảnh hoặc ảnh chưa ký được: ảnh null
 *
 * @param horseId UUID của ngựa
 * @param briefs Tên và mã ảnh của các ngựa trong trang
 * @param photoUrls Map từ mã ảnh sang link tải đã ký
 * @returns Tên ngựa và link ảnh để đưa vào mapper
 */
export function horseListDisplay(
  horseId: string,
  briefs: Map<string, HorseBrief>,
  photoUrls: Map<string, string>,
): HorseListDisplay {
  const brief = briefs.get(horseId);
  return {
    horseName: brief?.name ?? '',
    horsePhotoUrl: brief?.mediaId
      ? (photoUrls.get(brief.mediaId) ?? null)
      : null,
  };
}
