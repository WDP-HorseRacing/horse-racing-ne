import { Injectable, NotFoundException } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { MediaService } from '../../media/services/media.service';
import { PEDIGREE_DEPTH } from '../constants/horse.constants';
import { PastHorseDetailDto, PastHorseListItemDto } from '../dto';
import { toPedigreeNode } from '../mappers/horse-profiles.mapper';
import {
  toPastHorseDetail,
  toPastHorseList,
} from '../mappers/past-horses.mapper';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseProfilesRepository } from './horse-profiles.repository';

@Injectable()
export class PastHorsesService {
  constructor(
    private readonly profiles: HorseProfilesRepository,
    private readonly access: HorseAccessService,
    private readonly media: MediaService,
  ) {}

  /**
   * Liệt kê các con ngựa chủ cũ từng sở hữu nhưng không còn sở hữu
   *
   * - Gồm ngựa đã chuyển nhượng nội bộ hoặc ra ngoài; bỏ ngựa người gọi đang sở hữu và hồ sơ đã xóa
   * - Không trả chủ mới, khu, ô, sức khỏe hay tình trạng hiện tại
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về mỗi con ngựa một dòng: tên, ảnh và các khoảng đã sở hữu
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async list(actor: Actor): Promise<PastHorseListItemDto[]> {
    const caller = await this.access.currentUser(actor);
    const rows = await this.profiles.pastOwnershipsOf(caller.id);
    const mediaIds = [
      ...new Set(
        rows
          .map((row) => row.mediaId)
          .filter((mediaId): mediaId is string => mediaId !== null),
      ),
    ];
    return toPastHorseList(rows, await this.media.signDownloadUrls(mediaIds));
  }

  /**
   * Lấy thông tin cơ bản của một con ngựa chủ cũ từng sở hữu
   *
   * - Chỉ khi người gọi có giai đoạn sở hữu đã kết thúc của con ngựa và không còn là chủ hiện tại
   * - Phả hệ 2 đời chỉ có tên tổ tiên
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về tên, ảnh, giới tính, ngày sinh, màu lông, phả hệ và các khoảng đã sở hữu
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu người gọi chưa từng sở hữu con ngựa, đang là chủ hiện tại, hoặc hồ sơ đã xóa
   */
  async detail(actor: Actor, horseId: string): Promise<PastHorseDetailDto> {
    const caller = await this.access.currentUser(actor);
    const rows = await this.profiles.pastOwnershipsOf(caller.id, horseId);
    if (rows.length === 0) {
      throw new NotFoundException('Không tìm thấy ngựa');
    }
    const mediaId = rows[0].mediaId;
    const [photoUrls, ancestors] = await Promise.all([
      this.media.signDownloadUrls(mediaId ? [mediaId] : []),
      this.profiles.findPedigreeAncestors(horseId, PEDIGREE_DEPTH),
    ]);
    return toPastHorseDetail(
      rows,
      mediaId ? (photoUrls.get(mediaId) ?? null) : null,
      ancestors.map((row) => toPedigreeNode(row, false)),
    );
  }
}
