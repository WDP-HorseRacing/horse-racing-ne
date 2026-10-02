import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOperator,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
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
  isAbnormalMeasurement,
  assertDistinctMeasurementTypes,
  assertMeasuredAt,
  assertMeasurementValue,
  assertMeasurementDeletable,
  assertTimeRange,
  canRecordMeasurement,
  measurementAlerts,
} from '../policies/horse.policy';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type {
  ExamMeasurementInput,
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
   * Lấy một trang lịch sử chỉ số của ngựa trong phạm vi người gọi, mới nhất trước
   *
   * - Lọc theo loại chỉ số và khoảng thời gian đo (from, to), phân trang theo page, limit
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @param query Loại chỉ số, khoảng thời gian đo và trang cần đọc
   * @returns Promise trả về một trang bản ghi đo của ngựa
   * @throws BadRequestException Nếu from sau to
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listMeasurements(
    actor: Actor,
    horseId: string,
    query: HorseMeasurementListQueryDto,
  ): Promise<PaginationResponseDto<HorseMeasurementResponseDto>> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    assertTimeRange(from, to);
    await this.access.findReadable(actor, horseId);
    const [measurements, total] = await this.measurements.findAndCount({
      where: {
        horseId,
        ...(query.type ? { type: query.type } : {}),
        ...(from || to ? { measuredAt: this.measuredAtRange(from, to) } : {}),
      },
      relations: { measurer: true },
      order: { measuredAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginationResponseDto(
      measurements.map(toMeasurementResponse),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Dựng điều kiện lọc thời điểm đo theo from, to
   *
   * @param from Thời điểm bắt đầu, bỏ trống nếu không chặn đầu
   * @param to Thời điểm kết thúc, bỏ trống nếu không chặn cuối
   * @returns Điều kiện TypeORM cho cột measuredAt
   */
  private measuredAtRange(from?: Date, to?: Date): FindOperator<Date> {
    if (from && to) return Between(from, to);
    if (from) return MoreThanOrEqual(from);
    return LessThanOrEqual(to as Date);
  }

  /**
   * Ghi một lần đo chỉ số cơ thể của con ngựa, gồm một hoặc nhiều loại chỉ số.
   *
   * - Veterinarian ghi cho mọi ngựa; Head Trainer chỉ ngựa thuộc khu mình; Groom chỉ ngựa được phân công. Ai được ghi thì ghi được cả bốn loại
   * - Không ghi cho ngựa đã chuyển nhượng hoặc hồ sơ đã xóa
   * - Giá trị phải trong khoảng hợp lệ; thời điểm đo không ở tương lai, lùi tối đa 7 ngày; mỗi loại chỉ một giá trị
   * - Có giá trị ngoài khoảng bình thường mà chưa gửi confirmAbnormal = true thì trả 422, chưa lưu gì
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
        await this.assertCanRecord(actor, caller.id, horseId, manager);
        this.access.assertNotTransferred(horse);
        this.assertValidValues(body, measuredAt);

        const created = await this.saveMeasurements(manager, {
          horseId,
          values: body.values,
          measuredAt,
          measuredBy: caller.id,
          source: HorseMeasurementSource.MANUAL,
          medicalRecordId: null,
          abnormalConfirmed: body.confirmAbnormal === true,
          feature: 'F1.5',
        });
        return { callerId: caller.id, created };
      },
    );

    this.publishAlerts(
      this.toAlertEvents(created, callerId, HorseMeasurementSource.MANUAL),
    );
    return created.map(({ measurement, alerts }) =>
      toCreatedMeasurementResponse(measurement, alerts),
    );
  }

  /**
   * Ghi số đo lấy trong một buổi khám vào bảng chỉ số. Dùng cho module medical gọi trong transaction của họ.
   *
   * - Cùng luật giá trị, thời điểm đo và xác nhận giá trị bất thường như addMeasurements
   * - Bản ghi lưu với nguồn MEDICAL_EXAM và medicalRecordId của buổi khám; mỗi bản ghi một dòng nhật ký
   * - Không tự mở transaction, không publish event: trả về các cảnh báo; nơi gọi phát bằng publishAlerts sau khi commit
   * - Nơi gọi đã khóa row ngựa và kiểm quyền ghi y tế
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, buổi khám, người đo, thời điểm đo, các cặp loại/giá trị và cờ xác nhận
   * @returns Promise trả về các cảnh báo sinh ra, chưa phát
   * @throws BadRequestException Nếu giá trị ngoài khoảng hợp lệ, trùng loại hoặc thời điểm đo không hợp lệ
   * @throws UnprocessableEntityException Nếu có giá trị ngoài khoảng bình thường mà chưa xác nhận
   */
  async recordExamMeasurements(
    manager: EntityManager,
    input: ExamMeasurementInput,
  ): Promise<HorseMeasurementAlertEvent[]> {
    if (input.values.length === 0) return [];
    this.assertValidValues(input, input.measuredAt);
    const created = await this.saveMeasurements(manager, {
      horseId: input.horseId,
      values: input.values,
      measuredAt: input.measuredAt,
      measuredBy: input.measuredBy,
      source: HorseMeasurementSource.MEDICAL_EXAM,
      medicalRecordId: input.medicalRecordId,
      abnormalConfirmed: input.confirmAbnormal,
      feature: input.feature,
    });
    return this.toAlertEvents(
      created,
      input.measuredBy,
      HorseMeasurementSource.MEDICAL_EXAM,
    );
  }

  /**
   * Xóa mềm mọi số đo của một buổi khám vừa bị hủy. Dùng cho module medical gọi trong transaction của họ.
   *
   * - Bản đã xóa bị ẩn khỏi lịch sử, biểu đồ và mốc cảnh báo giảm cân, giống deleteMeasurement
   * - Lưu lý do, người xóa; mỗi bản ghi một dòng nhật ký kèm lý do
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Buổi khám bị hủy, lý do hủy, người hủy và mã chức năng ghi nhật ký
   * @returns Promise trả về số bản ghi đo đã xóa mềm
   */
  async voidExamMeasurements(
    manager: EntityManager,
    input: {
      medicalRecordId: string;
      reason: string;
      actorId: string;
      feature: string;
    },
  ): Promise<number> {
    const measurements = await manager.find(HorseMeasurementEntity, {
      where: { medicalRecordId: input.medicalRecordId },
      lock: { mode: 'pessimistic_write' },
    });
    for (const measurement of measurements) {
      await manager.update(
        HorseMeasurementEntity,
        { id: measurement.id },
        { deleteReason: input.reason, deletedBy: input.actorId },
      );
      await manager.softDelete(HorseMeasurementEntity, { id: measurement.id });
      await this.audit.record(manager, {
        actorId: input.actorId,
        action: AuditAction.DELETE,
        entityType: AuditEntityType.HORSE_MEASUREMENT,
        entityId: measurement.id,
        before: {
          horseId: measurement.horseId,
          type: measurement.type,
          value: measurement.value,
          measuredAt: measurement.measuredAt,
          medicalRecordId: measurement.medicalRecordId,
        },
        after: null,
        reason: input.reason,
        feature: input.feature,
      });
    }
    return measurements.length;
  }

  /**
   * Phát các cảnh báo chỉ số đã sinh ra, gọi sau khi transaction ghi số đo đã commit
   *
   * @param events Các cảnh báo cần phát
   */
  publishAlerts(events: HorseMeasurementAlertEvent[]): void {
    for (const event of events) {
      this.events.publish(HORSE_MEASUREMENT_ALERT_EVENT, event);
    }
  }

  /**
   * Xóa mềm một bản ghi đo sai. Bản ghi không được sửa, ghi sai thì xóa rồi đo lại.
   *
   * - Chỉ Veterinarian (kiểm ở controller), bắt buộc nhập lý do
   * - Ngựa đã chuyển nhượng vẫn xóa được bản ghi sai (chỉ cấm ghi mới)
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
   * @throws ConflictException Nếu bản ghi đến từ buổi khám
   */
  async deleteMeasurement(
    actor: Actor,
    horseId: string,
    measurementId: string,
    body: DeleteHorseMeasurementDto,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const { caller } = await this.access.lockVisibleHorse(
        actor,
        horseId,
        manager,
      );

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
   * Lưu các bản ghi đo của một lần đo, mỗi bản ghi một dòng nhật ký, kèm cảnh báo tính theo mốc cân nặng
   *
   * - Cờ bất thường tính lúc lưu và lưu cùng bản ghi; nhật ký ghi cả cờ bất thường và việc người đo đã xác nhận
   *
   * @param manager EntityManager của transaction đang chạy
   * @param input Ngựa, các cặp loại/giá trị, thời điểm đo, người đo, nguồn, buổi khám (nếu có), cờ đã xác nhận giá trị bất thường và mã chức năng ghi nhật ký
   * @returns Promise trả về các bản ghi vừa lưu (kèm người đo), mỗi bản kèm cảnh báo của nó
   */
  private async saveMeasurements(
    manager: EntityManager,
    input: {
      horseId: string;
      values: Array<{ type: HorseMeasurementType; value: number }>;
      measuredAt: Date;
      measuredBy: string;
      source: HorseMeasurementSource;
      medicalRecordId: string | null;
      abnormalConfirmed: boolean;
      feature: string;
    },
  ): Promise<
    Array<{
      measurement: HorseMeasurementEntity;
      alerts: HorseMeasurementAlertResult[];
    }>
  > {
    const repository = manager.getRepository(HorseMeasurementEntity);
    const created: Array<{
      measurement: HorseMeasurementEntity;
      alerts: HorseMeasurementAlertResult[];
    }> = [];
    for (const item of input.values) {
      const weightBaseline = await this.weightBaseline(
        input.horseId,
        item.type,
        input.measuredAt,
        manager,
      );
      const isAbnormal = isAbnormalMeasurement(item.type, item.value);
      const saved = await repository.save(
        repository.create({
          horseId: input.horseId,
          type: item.type,
          value: item.value.toFixed(2),
          measuredAt: input.measuredAt,
          isAbnormal,
          measuredBy: input.measuredBy,
          source: input.source,
          medicalRecordId: input.medicalRecordId,
        }),
      );
      await this.audit.record(manager, {
        actorId: input.measuredBy,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.HORSE_MEASUREMENT,
        entityId: saved.id,
        before: null,
        after: {
          horseId: input.horseId,
          type: item.type,
          value: saved.value,
          measuredAt: input.measuredAt,
          source: input.source,
          isAbnormal,
          abnormalConfirmed: input.abnormalConfirmed,
          ...(input.medicalRecordId
            ? { medicalRecordId: input.medicalRecordId }
            : {}),
        },
        feature: input.feature,
      });
      created.push({
        measurement: await repository.findOneOrFail({
          where: { id: saved.id },
          relations: { measurer: true },
        }),
        alerts: measurementAlerts(item.type, item.value, weightBaseline),
      });
    }
    return created;
  }

  /**
   * Dựng payload HORSE_MEASUREMENT_ALERT_EVENT cho từng cảnh báo của các bản ghi vừa lưu
   *
   * @param created Các bản ghi vừa lưu, mỗi bản kèm cảnh báo
   * @param measuredBy UUID người đo
   * @param source Nguồn số đo (nhập tay hoặc buổi khám)
   * @returns Danh sách payload, mỗi cảnh báo một payload
   */
  private toAlertEvents(
    created: Array<{
      measurement: HorseMeasurementEntity;
      alerts: HorseMeasurementAlertResult[];
    }>,
    measuredBy: string,
    source: HorseMeasurementSource,
  ): HorseMeasurementAlertEvent[] {
    return created.flatMap(({ measurement, alerts }) =>
      alerts.map((alert) => ({
        ...alert,
        measurementId: measurement.id,
        horseId: measurement.horseId,
        measuredBy,
        type: measurement.type,
        value: Number(measurement.value),
        unit: HORSE_MEASUREMENT_SPECS[measurement.type].unit,
        measuredAt: measurement.measuredAt,
        source,
      })),
    );
  }

  /**
   * Lấy cân nặng mốc để so cảnh báo giảm cân: cao nhất trong WEIGHT_DROP_WINDOW_DAYS ngày trước thời điểm đo.
   *
   * @param horseId UUID của ngựa
   * @param type Loại chỉ số đang ghi
   * @param measuredAt Thời điểm đo của bản ghi mới
   * @param manager EntityManager của transaction đang chạy
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
   * Kiểm tra người gọi được ghi chỉ số cho con ngựa.
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
    body: {
      values: Array<{ type: HorseMeasurementType; value: number }>;
      confirmAbnormal?: boolean;
    },
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
