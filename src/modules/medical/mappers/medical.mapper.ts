import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { PrescriptionResponseDto } from '../dto/prescription.response.dto';
import { InjuryMarkerEntity } from '../entities/injury-marker.entity';
import { MedicalRecordEntity } from '../entities/medical-record.entity';
import { PrescriptionEntity } from '../entities/prescription.entity';

/**
 * Chuyển đơn thuốc sang DTO, chỉ thêm liều lượng và tần suất khi người gọi được xem.
 *
 * @param prescription Thực thể đơn thuốc
 * @param includeDosage Người gọi có được xem liều lượng, tần suất không (Horse Owner thì không)
 * @returns PrescriptionResponseDto - không có key dosage, frequency khi includeDosage là false
 */
export function toPrescriptionResponse(
  prescription: PrescriptionEntity,
  includeDosage: boolean,
): PrescriptionResponseDto {
  return {
    id: prescription.id,
    medicine: prescription.medicine,
    ...(includeDosage
      ? { dosage: prescription.dosage, frequency: prescription.frequency }
      : {}),
    startDate: prescription.startDate,
    endDate: prescription.endDate,
  };
}

/**
 * Chuyển hồ sơ khám kèm các đơn thuốc sang DTO.
 *
 * @param record Thực thể hồ sơ khám
 * @param prescriptions Các đơn thuốc của hồ sơ
 * @param includeDosage Người gọi có được xem liều lượng, tần suất của đơn thuốc không
 * @returns MedicalRecordResponseDto - Hồ sơ khám kèm đơn thuốc
 */
export function toMedicalRecordResponse(
  record: MedicalRecordEntity,
  prescriptions: PrescriptionEntity[],
  includeDosage: boolean,
): MedicalRecordResponseDto {
  return {
    id: record.id,
    examDate: record.examDate,
    diagnosis: record.diagnosis,
    severity: record.severity,
    resultingStatus: record.resultingStatus,
    vetId: record.vetId,
    voidedAt: record.voidedAt,
    prescriptions: prescriptions.map((prescription) =>
      toPrescriptionResponse(prescription, includeDosage),
    ),
  };
}

/**
 * Chuyển vết thương sang DTO.
 *
 * @param injury Thực thể vết thương
 * @returns InjuryMarkerResponseDto - Vết thương
 */
export function toInjuryMarkerResponse(
  injury: InjuryMarkerEntity,
): InjuryMarkerResponseDto {
  return {
    id: injury.id,
    medicalRecordId: injury.medicalRecordId,
    bodyRegion: injury.bodyRegion,
    position: injury.position,
    injuryType: injury.injuryType,
    recoveryStatus: injury.recoveryStatus,
    notes: injury.notes,
  };
}
