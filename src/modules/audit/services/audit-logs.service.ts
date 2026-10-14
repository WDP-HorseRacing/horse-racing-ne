import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type FindOptionsWhere,
  LessThan,
  MoreThanOrEqual,
  And,
  Repository,
} from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import type { Actor } from '../../../common/types/actor';
import {
  clubDateTimeToInstant,
  shiftDays,
} from '../../../common/utils/club-date';
import { currentUserForActor } from '../../users/utils/current-user';
import type {
  AuditLogDetailDto,
  AuditLogListQueryDto,
  AuditLogPageDto,
} from '../dto/audit-log.dto';
import { AuditLogEntity } from '../entities/audit-log.entity';
import {
  toAuditLogDetail,
  toAuditLogSummary,
} from '../mappers/audit-log.mapper';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly logs: Repository<AuditLogEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lấy một trang nhật ký thao tác, mới nhất trước
   *
   * - Lọc theo người thực hiện, hành động, loại và id đối tượng; bỏ trống thì không lọc
   * - from, to tính theo lịch câu lạc bộ, lấy trọn cả hai ngày đầu và cuối
   * - Người thực hiện đã bị xóa vẫn hiện tên và vai trò
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param query Bộ lọc và phân trang
   * @returns Promise trả về các dòng nhật ký của trang, không kèm dữ liệu trước và sau, cùng tổng số dòng khớp lọc
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws BadRequestException Nếu ngày bắt đầu sau ngày kết thúc
   */
  async list(
    actor: Actor,
    query: AuditLogListQueryDto,
  ): Promise<AuditLogPageDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    }
    const where: FindOptionsWhere<AuditLogEntity> = {
      actorId: query.actorId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
    };
    const start = query.from
      ? clubDateTimeToInstant(query.from, '00:00')
      : undefined;
    const end = query.to
      ? clubDateTimeToInstant(shiftDays(query.to, 1), '00:00')
      : undefined;
    if (start && end) {
      where.createdAt = And(MoreThanOrEqual(start), LessThan(end));
    } else if (start) {
      where.createdAt = MoreThanOrEqual(start);
    } else if (end) {
      where.createdAt = LessThan(end);
    }
    const [rows, total] = await this.logs.findAndCount({
      where,
      relations: { actor: true },
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginationResponseDto(
      rows.map(toAuditLogSummary),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Xem chi tiết một dòng nhật ký thao tác, kèm dữ liệu trước và sau
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của dòng nhật ký
   * @returns Promise trả về dòng nhật ký
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có dòng nhật ký
   */
  async get(actor: Actor, id: string): Promise<AuditLogDetailDto> {
    await currentUserForActor(this.dataSource.manager, actor);
    const log = await this.logs.findOne({
      where: { id },
      relations: { actor: true },
      withDeleted: true,
    });
    if (!log) throw new NotFoundException('Không tìm thấy nhật ký');
    return toAuditLogDetail(log);
  }
}
