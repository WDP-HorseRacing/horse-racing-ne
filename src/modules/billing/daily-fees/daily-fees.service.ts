import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import type { FieldError } from '../../../common/utils/field-errors';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { currentUserForActor } from '../../users/utils/current-user';
import { CreateDailyFeeDto, DailyFeeResponseDto } from '../dto/daily-fee.dto';
import { DailyFeeEntity } from '../entities/daily-fee.entity';
import { toDailyFeeResponse } from '../mappers/daily-fee.mapper';
import {
  assertDailyFeeDeletable,
  assertEffectiveFromNotPast,
} from '../policies/daily-fee.policy';

const EFFECTIVE_FROM_TAKEN: FieldError = {
  field: 'effectiveFrom',
  message: 'Đã có mức phí bắt đầu từ ngày này',
};

/**
 * Mức phí nuôi ngựa theo ngày của CLB: lịch sử, đặt mức mới, xóa mức chưa hiệu lực
 */
@Injectable()
export class DailyFeesService {
  constructor(
    @InjectRepository(DailyFeeEntity)
    private readonly fees: Repository<DailyFeeEntity>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Liệt kê mọi mức phí, ngày hiệu lực mới nhất trước
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về các mức phí
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   */
  async list(actor: Actor): Promise<DailyFeeResponseDto[]> {
    await currentUserForActor(this.dataSource.manager, actor);
    const rows = await this.fees.find({ order: { effectiveFrom: 'DESC' } });
    return rows.map(toDailyFeeResponse);
  }

  /**
   * Đặt mức phí mới áp dụng từ một ngày, từ hôm nay trở đi
   *
   * - Ghi nhật ký kèm ngày hiệu lực và mức phí
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Ngày hiệu lực và phí một con một ngày
   * @returns Promise trả về mức phí vừa đặt
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws BadRequestException Nếu ngày hiệu lực trước hôm nay
   * @throws ConflictException Nếu đã có mức phí bắt đầu từ ngày đó
   */
  async create(
    actor: Actor,
    body: CreateDailyFeeDto,
  ): Promise<DailyFeeResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    assertEffectiveFromNotPast(body.effectiveFrom, clubToday());
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const fee = await manager.save(
            manager.create(DailyFeeEntity, {
              effectiveFrom: body.effectiveFrom,
              dailyFee: body.dailyFee.toString(),
              createdBy: caller.id,
            }),
          );
          await this.auditService.record(manager, {
            actorId: caller.id,
            action: AuditAction.CREATE,
            entityType: AuditEntityType.DAILY_FEE,
            entityId: fee.id,
            before: null,
            after: {
              effectiveFrom: fee.effectiveFrom,
              dailyFee: body.dailyFee,
            },
            feature: AuditFeature.DAILY_FEE,
          });
          return fee;
        }),
      EFFECTIVE_FROM_TAKEN,
    );
    return toDailyFeeResponse(saved);
  }

  /**
   * Xóa một mức phí chưa có hiệu lực
   *
   * - Ghi nhật ký kèm ngày hiệu lực và mức phí bị xóa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param id UUID của mức phí
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa được gán vai trò
   * @throws NotFoundException Nếu không có mức phí
   * @throws ConflictException Nếu mức phí đã có hiệu lực
   */
  async remove(actor: Actor, id: string): Promise<void> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.dataSource.transaction(async (manager) => {
      const fee = await manager.findOne(DailyFeeEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!fee) throw new NotFoundException('Không tìm thấy mức phí');
      assertDailyFeeDeletable(fee.effectiveFrom, clubToday());
      await manager.delete(DailyFeeEntity, { id });
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.DAILY_FEE,
        entityId: id,
        before: {
          effectiveFrom: fee.effectiveFrom,
          dailyFee: Number(fee.dailyFee),
        },
        after: null,
        feature: AuditFeature.DAILY_FEE,
      });
    });
  }
}
