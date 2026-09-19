import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';

@Injectable()
export class HorseMeasurementsRepository {
  constructor(
    @InjectRepository(HorseMeasurementEntity)
    private readonly measurements: Repository<HorseMeasurementEntity>,
  ) {}

  /**
   * List measurements of a horse, newest first, capped at 200 records
   * @param horseId The ID of the horse
   * @param type Optional measurement type to filter by
   * @returns A promise resolving to the measurements with their measurers
   */
  listMeasurements(
    horseId: string,
    type?: HorseMeasurementType,
  ): Promise<HorseMeasurementEntity[]> {
    return this.measurements.find({
      where: { horseId, ...(type ? { type } : {}) },
      relations: { measurer: true },
      order: { measuredAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Persist a new measurement for a horse
   * @param measurement The measurement fields to persist
   * @returns A promise resolving to the saved measurement with its measurer
   */
  async addMeasurement(
    measurement: Pick<
      HorseMeasurementEntity,
      'horseId' | 'type' | 'value' | 'measuredAt' | 'measuredBy'
    >,
  ): Promise<HorseMeasurementEntity> {
    const saved = await this.measurements.save(
      this.measurements.create(measurement),
    );
    return this.measurements.findOneOrFail({
      where: { id: saved.id },
      relations: { measurer: true },
    });
  }

  /**
   * Lấy cân nặng cao nhất của ngựa trong một khoảng thời gian đo, dùng làm mốc cảnh báo giảm cân.
   *
   * - Khoảng là [from, to): gồm from, không gồm to
   * - Bản ghi đã xóa mềm không được tính
   *
   * @param horseId UUID của ngựa
   * @param from Đầu khoảng (gồm)
   * @param to Cuối khoảng (không gồm)
   * @returns Promise trả về cân nặng cao nhất (kg), null nếu không có bản ghi nào
   */
  async maxWeightBetween(
    horseId: string,
    from: Date,
    to: Date,
  ): Promise<number | null> {
    const row = await this.measurements
      .createQueryBuilder('m')
      .select('MAX(m.value)', 'max')
      .where('m.horseId = :horseId', { horseId })
      .andWhere('m.type = :type', { type: HorseMeasurementType.WEIGHT })
      .andWhere('m.measuredAt >= :from AND m.measuredAt < :to', { from, to })
      .getRawOne<{ max: string | null }>();
    return row?.max == null ? null : Number(row.max);
  }
}
