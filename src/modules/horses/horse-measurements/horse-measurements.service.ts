import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import type { Actor } from '../../../common/types/actor';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';

import {
  CreatedHorseMeasurementResponseDto,
  CreateHorseMeasurementDto,
  DeleteHorseMeasurementDto,
  HorseMeasurementListQueryDto,
  HorseMeasurementResponseDto,
} from '../dto';
import {
  toCreatedMeasurementResponse,
  toMeasurementResponse,
} from '../mappers/horse-measurements.mapper';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import {
  assertAbnormalConfirmed,
  assertDistinctMeasurementTypes,
  assertMeasuredAt,
  assertMeasurementValue,
  assertMeasurementDeletable,
  canRecordMeasurement,
  measurementAlerts,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type {
  HorseMeasurementAlertEvent,
  HorseMeasurementAlertResult,
} from '../types/horse.types';
import {
  HORSE_MEASUREMENT_ALERT_EVENT,
  HORSE_MEASUREMENT_SPECS,
  WEIGHT_DROP_WINDOW_DAYS,
} from '../constants/horse.constants';

@Injectable()
export class HorseMeasurementsService {
  constructor(
    @InjectRepository(HorseMeasurementEntity)
    private readonly measurements: Repository<HorseMeasurementEntity>,
    private readonly horses: HorsesSharedRepository,
    private readonly access: HorseAccessService,
    private readonly dataSource: DataSource,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  /**
   * List the measurements of a horse visible to the caller
   * @param actor The actor resolved from the JWT
   * @param horseId The ID of the horse
   * @param query The query parameters
   * @returns A promise resolving to the measurements of the horse
   * @throws NotFoundException if the horse is not found or not visible to the caller
   */
  async listMeasurements(
    actor: Actor,
    horseId: string,
    query: HorseMeasurementListQueryDto,
  ): Promise<HorseMeasurementResponseDto[]> {
    await this.access.findReadable(actor, horseId);
    const measurements = await this.measurements.find({
      where: { horseId, ...(query.type ? { type: query.type } : {}) },
      relations: { measurer: true },
      order: { measuredAt: 'DESC' },
      take: 200,
    });
    return measurements.map(toMeasurementResponse);
  }

  /**
   * Ghi một lần đo chỉ số cơ thể của con ngựa, gồm một hoặc nhiều loại chỉ số (F1.5).
   *
   * - Veterinarian ghi cho mọi ngựa; Head Trainer chỉ ngựa thuộc khu mình; Groom chỉ ngựa được phân công. Ai được ghi thì ghi được cả bốn loại
   * - Không ghi cho ngựa đã chuyển nhượng hoặc hồ sơ đã xóa
   * - Giá trị phải trong khoảng hợp lệ; thời điểm đo không ở tương lai, lùi tối đa 7 ngày; mỗi loại chỉ một giá trị
   * - Có giá trị ngoài khoảng bình thường mà chưa gửi confirmAbnormal = true thì trả 422 để giao diện hỏi xác nhận, chưa lưu gì
   * - Bản ghi lưu với nguồn MANUAL; mỗi bản ghi một dòng nhật ký
   * - Tự sinh cảnh báo (sốt, giảm cân trong 14 ngày), trả trong response và phát HORSE_MEASUREMENT_ALERT_EVENT sau khi commit
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param body Các cặp loại/giá trị, thời điểm đo (mặc định hiện tại) và cờ xác nhận giá trị bất thường
   * @returns Promise trả về các bản ghi vừa tạo, mỗi bản kèm cảnh báo của nó
   * @throws NotFoundException Nếu không có ngựa, hồ sơ đã xóa hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi không được ghi chỉ số cho con ngựa này
   * @throws BadRequestException Nếu giá trị ngoài khoảng hợp lệ, trùng loại hoặc thời điểm đo không hợp lệ
   * @throws UnprocessableEntityException Nếu có giá trị ngoài khoảng bình thường mà chưa xác nhận
   * @throws ConflictException Nếu ngựa đã chuyển nhượng
   */
  async addMeasurements(
    actor: Actor,
    horseId: string,
    body: CreateHorseMeasurementDto,
  ): Promise<CreatedHorseMeasurementResponseDto[]> {
    const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();

    const { callerId, created } = await this.dataSource.transaction(
      async (manager) => {
        const { caller, horse } = await this.access.lockVisibleHorse(
          actor,
          horseId,
          manager,
        );
        this.access.assertNotTransferred(horse);
        await this.assertCanRecord(actor, caller.id, horseId, manager);
        this.assertValidValues(body, measuredAt);

        const repository = manager.getRepository(HorseMeasurementEntity);
        const created: Array<{
          measurement: HorseMeasurementEntity;
          alerts: HorseMeasurementAlertResult[];
        }> = [];
        for (const item of body.values) {
          const weightBaseline = await this.weightBaseline(
            horseId,
            item.type,
            measuredAt,
            manager,
          );
          const saved = await repository.save(
            repository.create({
              horseId,
              type: item.type,
              value: item.value.toFixed(2),
              measuredAt,
              measuredBy: caller.id,
              source: HorseMeasurementSource.MANUAL,
              medicalRecordId: null,
            }),
          );
          await this.audit.record(manager, {
            actorId: caller.id,
            action: AuditAction.CREATE,
            entityType: AuditEntityType.HORSE_MEASUREMENT,
            entityId: saved.id,
            before: null,
            after: {
              horseId,
              type: item.type,
              value: saved.value,
              measuredAt,
              source: HorseMeasurementSource.MANUAL,
            },
            feature: 'F1.5',
          });
          created.push({
            measurement: await repository.findOneOrFail({
              where: { id: saved.id },
              relations: { measurer: true },
            }),
            alerts: measurementAlerts(item.type, item.value, weightBaseline),
          });
        }
        return { callerId: caller.id, created };
      },
    );

    for (const { measurement, alerts } of created) {
      for (const alert of alerts) {
        const event: HorseMeasurementAlertEvent = {
          ...alert,
          measurementId: measurement.id,
          horseId,
          measuredBy: callerId,
          type: measurement.type,
          value: Number(measurement.value),
          unit: HORSE_MEASUREMENT_SPECS[measurement.type].unit,
          measuredAt,
        };
        this.events.publish(HORSE_MEASUREMENT_ALERT_EVENT, event);
      }
    }
    return created.map(({ measurement, alerts }) =>
      toCreatedMeasurementResponse(measurement, alerts),
    );
  }

  /**
   * Xóa mềm một bản ghi đo sai (F1.5 mục 4). Bản ghi không được sửa, ghi sai thì xóa rồi đo lại.
   *
   * - Chỉ Veterinarian (kiểm ở controller), bắt buộc nhập lý do
   * - Bản ghi có nguồn từ buổi khám (MEDICAL_EXAM) không xóa ở đây, phải xử lý bên hồ sơ y tế
   * - Khóa ngựa rồi khóa dòng bản ghi trong transaction; lưu lý do, người xóa và ghi nhật ký kèm lý do
   * - Bản đã xóa bị ẩn khỏi lịch sử, biểu đồ, chỉ số mới nhất và mốc cảnh báo giảm cân
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param measurementId UUID của bản ghi đo
   * @param body Lý do xóa
   * @returns Promise hoàn tất khi đã xóa
   * @throws NotFoundException Nếu không có ngựa, ngựa ngoài phạm vi, hoặc không có bản ghi đo (chưa xóa) của ngựa này
   * @throws ConflictException Nếu ngựa đã chuyển nhượng, hoặc bản ghi đến từ buổi khám
   */
  async deleteMeasurement(
    actor: Actor,
    horseId: string,
    measurementId: string,
    body: DeleteHorseMeasurementDto,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const { caller, horse } = await this.access.lockVisibleHorse(
        actor,
        horseId,
        manager,
      );
      this.access.assertNotTransferred(horse);

      const measurement = await manager.findOne(HorseMeasurementEntity, {
        where: { id: measurementId, horseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!measurement) {
        throw new NotFoundException('Không tìm thấy bản ghi đo');
      }
      assertMeasurementDeletable(measurement.source);
      await manager.update(
        HorseMeasurementEntity,
        { id: measurement.id },
        { deleteReason: body.reason, deletedBy: caller.id },
      );
      await manager.softDelete(HorseMeasurementEntity, { id: measurement.id });
      await this.audit.record(manager, {
        actorId: caller.id,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.HORSE_MEASUREMENT,
        entityId: measurement.id,
        before: {
          horseId: measurement.horseId,
          type: measurement.type,
          value: measurement.value,
          measuredAt: measurement.measuredAt,
          measuredBy: measurement.measuredBy,
        },
        after: null,
        reason: body.reason,
        feature: 'F1.5',
      });
    });
  }

  /**
   * Lấy cân nặng mốc để so cảnh báo giảm cân: cao nhất trong WEIGHT_DROP_WINDOW_DAYS ngày trước thời điểm đo.
   *
   * @param horseId UUID của ngựa
   * @param type Loại chỉ số đang ghi
   * @param measuredAt Thời điểm đo của bản ghi mới
   * @returns Promise trả về cân nặng mốc, null nếu không phải loại WEIGHT hoặc không có bản ghi trong cửa sổ
   */
  private async weightBaseline(
    horseId: string,
    type: HorseMeasurementType,
    measuredAt: Date,
    manager: EntityManager,
  ): Promise<number | null> {
    if (type !== HorseMeasurementType.WEIGHT) return null;
    const from = new Date(
      measuredAt.getTime() - WEIGHT_DROP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const row = await manager
      .getRepository(HorseMeasurementEntity)
      .createQueryBuilder('m')
      .select('MAX(m.value)', 'max')
      .where('m.horseId = :horseId', { horseId })
      .andWhere('m.type = :type', { type: HorseMeasurementType.WEIGHT })
      .andWhere('m.measuredAt >= :from AND m.measuredAt < :to', {
        from,
        to: measuredAt,
      })
      .getRawOne<{ max: string | null }>();
    return row?.max == null ? null : Number(row.max);
  }

  /**
   * Kiểm tra người gọi được ghi chỉ số cho con ngựa (F1.5).
   *
   * - Chỉ query khu phụ trách khi người gọi là Head Trainer, chỉ query phân công khi là Groom
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param callerId UUID của người gọi
   * @param horseId UUID của ngựa
   * @param manager EntityManager của transaction đang chạy
   * @returns Promise hoàn tất khi kiểm tra xong
   * @throws ForbiddenException Nếu người gọi không được ghi chỉ số cho con ngựa này
   */
  private async assertCanRecord(
    actor: Actor,
    callerId: string,
    horseId: string,
    manager: EntityManager,
  ): Promise<void> {
    const [isInTrainerBarn, isAssignedGroom] = await Promise.all([
      this.access.hasRole(actor, UserRole.HEAD_TRAINER)
        ? this.access.isHorseInTrainerBarn(manager, horseId, callerId)
        : Promise.resolve(false),
      this.access.hasRole(actor, UserRole.GROOM)
        ? this.horses.isGroomAssigned(horseId, callerId, manager)
        : Promise.resolve(false),
    ]);
    if (
      !canRecordMeasurement({
        roles: actor.roles,
        isInTrainerBarn,
        isAssignedGroom,
      })
    ) {
      throw new ForbiddenException(
        'Bạn không được ghi chỉ số cho con ngựa này',
      );
    }
  }

  /**
   * Kiểm tra dữ liệu một lần đo trước khi lưu.
   *
   * @param body Các cặp loại/giá trị và cờ xác nhận giá trị bất thường
   * @param measuredAt Thời điểm đo đã quy đổi
   * @throws BadRequestException Nếu trùng loại, giá trị ngoài khoảng hợp lệ hoặc thời điểm đo không hợp lệ
   * @throws UnprocessableEntityException Nếu có giá trị ngoài khoảng bình thường mà confirmAbnormal chưa bật
   */
  private assertValidValues(
    body: CreateHorseMeasurementDto,
    measuredAt: Date,
  ): void {
    assertDistinctMeasurementTypes(body.values.map((item) => item.type));
    for (const item of body.values) {
      assertMeasurementValue(item.type, item.value);
    }
    assertMeasuredAt(measuredAt, new Date());
    assertAbnormalConfirmed(body.values, body.confirmAbnormal === true);
  }
}
