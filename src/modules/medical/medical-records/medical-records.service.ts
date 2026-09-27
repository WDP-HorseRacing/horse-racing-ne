import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import { toMedicalRecordResponse } from '../mappers/medical.mapper';
import { canSeeDosage } from '../policies/medical.policy';

@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly horseAccess: HorseAccessService,
    @InjectRepository(MedicalRecordEntity)
    private readonly records: Repository<MedicalRecordEntity>,
    @InjectRepository(PrescriptionEntity)
    private readonly prescriptions: Repository<PrescriptionEntity>,
    @InjectRepository(InjuryMarkerEntity)
    private readonly injuries: Repository<InjuryMarkerEntity>,
  ) {}

  /**
   * Lấy mọi buổi khám của con ngựa (trong và ngoài bệnh án, kể cả buổi đã hủy), mới nhất lên trên (F3.10).
   *
   * - Club Manager, Veterinarian, Head Trainer: xem đầy đủ, toàn câu lạc bộ.
   * - Groom: không xem (chặn ở controller).
   * - Horse Owner: chỉ ngựa đang sở hữu; đơn thuốc không có liều lượng, tần suất.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns A promise resolving to danh sách buổi khám kèm đơn thuốc và chấn thương
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listRecords(
    actor: Actor,
    horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    await this.horseAccess.findReadable(actor, horseId);
    const records = await this.records.find({
      where: { horseId },
      order: { examDate: 'DESC' },
    });
    return this.toResponses(records, canSeeDosage(actor.roles));
  }

  /**
   * Lấy chi tiết một buổi khám (F3.10).
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param recordId UUID của buổi khám
   * @returns A promise resolving to buổi khám kèm đơn thuốc và chấn thương
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có buổi khám, hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getRecord(
    actor: Actor,
    recordId: string,
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.records.findOne({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy buổi khám');
    await this.horseAccess.findReadable(actor, record.horseId);
    const [response] = await this.toResponses(
      [record],
      canSeeDosage(actor.roles),
    );
    return response;
  }

  /**
   * Gom đơn thuốc, chấn thương của các buổi khám rồi chuyển sang DTO, giữ nguyên thứ tự đầu vào.
   *
   * @param records Các buổi khám
   * @param seesDosage Người gọi có được xem liều lượng, tần suất đơn thuốc không
   * @returns A promise resolving to danh sách buổi khám dạng DTO
   */
  async toResponses(
    records: MedicalRecordEntity[],
    seesDosage: boolean,
  ): Promise<MedicalRecordResponseDto[]> {
    const recordIds = records.map((record) => record.id);
    const [prescriptions, injuries] = recordIds.length
      ? await Promise.all([
          this.prescriptions.find({
            where: { medicalRecordId: In(recordIds) },
            order: { startDate: 'DESC' },
          }),
          this.injuries.find({
            where: { medicalRecordId: In(recordIds) },
            order: { createdAt: 'ASC' },
          }),
        ])
      : [[], []];
    return records.map((record) =>
      toMedicalRecordResponse(
        record,
        prescriptions.filter((item) => item.medicalRecordId === record.id),
        injuries.filter((item) => item.medicalRecordId === record.id),
        seesDosage,
      ),
    );
  }
}
