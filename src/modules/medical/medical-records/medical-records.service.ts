import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../horses/shared/horse-ownership.service';
import { CareInstructionsResponseDto } from '../dto/care-instructions.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';
import {
  toCareInstructionsResponse,
  toMedicalRecordResponse,
} from '../mappers/medical.mapper';
import {
  canSeeDosage,
  canSeeMedicalCost,
  isGroomOnly,
  isVisitCostHidden,
} from '../policies/medical.policy';
import type { MedicalCostViewer } from '../types/medical-cost.types';

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
    private readonly ownerships: HorseOwnershipService,
  ) {}

  /**
   * Lấy mọi buổi khám của con ngựa (trong và ngoài bệnh án, kể cả buổi đã hủy), mới nhất lên trên.
   *
   * - Club Manager, Veterinarian, Head Trainer: xem đầy đủ, toàn câu lạc bộ.
   * - Groom: không xem (chặn ở controller).
   * - Horse Owner: chỉ ngựa đang sở hữu; đơn thuốc không có liều lượng, tần suất; buổi khám thuộc giai đoạn chủ khác có cost null và costHidden true.
   * - Head Trainer: không có key chi phí.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về danh sách buổi khám kèm đơn thuốc và chấn thương
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async listRecords(
    actor: Actor,
    horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    const viewer = await this.costViewer(actor, horseId);
    const records = await this.records.find({
      where: { horseId },
      order: { examDate: 'DESC' },
    });
    return this.toResponses(records, canSeeDosage(actor.roles), viewer);
  }

  /**
   * Lấy chi tiết một buổi khám, loại chi phí theo quyền người gọi như danh sách buổi khám.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param recordId UUID của buổi khám
   * @returns Promise trả về buổi khám kèm đơn thuốc và chấn thương
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có buổi khám, hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getRecord(
    actor: Actor,
    recordId: string,
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.records.findOne({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy buổi khám');
    const viewer = await this.costViewer(actor, record.horseId);
    const [response] = await this.toResponses(
      [record],
      canSeeDosage(actor.roles),
      viewer,
    );
    return response;
  }

  /**
   * Lấy ghi chú chăm sóc đang hiệu lực của con ngựa (ghi chú của buổi khám gần nhất chưa hủy)
   *
   * - Groom chỉ xem được ngựa mình đang phụ trách; các vai trò khác theo phạm vi xem hồ sơ ngựa
   * - Chỉ trả ghi chú, không trả chẩn đoán, đơn thuốc hay chi phí
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về ghi chú đang hiệu lực, hoặc current = null nếu không có
   * @throws ForbiddenException Nếu tài khoản không hoạt động, hoặc Groom không phụ trách con ngựa
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async getCareInstructions(
    actor: Actor,
    horseId: string,
  ): Promise<CareInstructionsResponseDto> {
    await this.horseAccess.findReadableHorseForActor(actor, horseId);
    if (isGroomOnly(actor.roles)) {
      const caller = await this.horseAccess.currentUser(actor);
      if (!(await this.horseAccess.isGroomAssigned(horseId, caller.id))) {
        throw new ForbiddenException('Bạn không phụ trách con ngựa này');
      }
    }
    const latest = await this.records.findOne({
      where: { horseId, voidedAt: IsNull() },
      order: { examDate: 'DESC' },
    });
    return toCareInstructionsResponse(horseId, latest);
  }

  /**
   * Kiểm quyền xem con ngựa rồi lấy quyền xem chi phí y tế của người gọi trên con ngựa đó
   *
   * - Head Trainer: không được xem chi phí
   * - Horse Owner: kèm các giai đoạn sở hữu của ngựa để lọc chi phí theo giai đoạn của mình
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param horseId UUID của ngựa
   * @returns Promise trả về quyền xem chi phí của người gọi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có ngựa hoặc ngựa nằm ngoài phạm vi của người gọi
   */
  async costViewer(actor: Actor, horseId: string): Promise<MedicalCostViewer> {
    const manager = this.records.manager;
    const caller = await this.horseAccess.currentUser(actor, manager);
    await this.horseAccess.findReadableHorse(
      manager,
      actor,
      caller.id,
      horseId,
    );
    const seesCost = canSeeMedicalCost(actor.roles);
    if (
      !seesCost ||
      this.horseAccess.scopeOf(actor, caller.id).kind !== 'OWNER'
    ) {
      return { seesCost, owner: null };
    }
    return {
      seesCost,
      owner: {
        ownerId: caller.id,
        periods: await this.ownerships.periodsOfHorse(manager, horseId),
      },
    };
  }

  /**
   * Gom đơn thuốc, chấn thương của các buổi khám rồi chuyển sang DTO, giữ nguyên thứ tự đầu vào.
   *
   * @param records Các buổi khám
   * @param seesDosage Người gọi có được xem liều lượng, tần suất đơn thuốc không
   * @param viewer Quyền xem chi phí của người gọi
   * @returns Promise trả về danh sách buổi khám dạng DTO
   */
  async toResponses(
    records: MedicalRecordEntity[],
    seesDosage: boolean,
    viewer: MedicalCostViewer,
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
        viewer.seesCost,
        isVisitCostHidden(viewer, record.examDate),
      ),
    );
  }
}
