import type {
  ClubFinanceResponseDto,
  FinanceOwnerDto,
  OwnerCostHorseDto,
  OwnerCostResponseDto,
} from '../dto/finance-report.dto';
import type {
  DailyFeeRow,
  MedicalChargeRow,
  ReportPeriod,
  SupplyValueRow,
  SurchargeRow,
} from '../types/report.types';

/**
 * Số liệu đã đọc để dựng báo cáo chi phí
 */
export interface FinanceSource {
  period: ReportPeriod;
  dailyFees: DailyFeeRow[];
  medicalCharges: MedicalChargeRow[];
  surcharges: SurchargeRow[];
}

/**
 * Dựng báo cáo chi phí của một chủ ngựa
 *
 * - Mỗi ngựa có ít nhất một ngày còn ở CLB dưới tên chủ trong kỳ, hoặc có buổi khám trong kỳ thuộc giai đoạn của chủ, một dòng; kể cả khi không phát sinh chi phí
 *
 * @param owner Chủ của báo cáo
 * @param source Phí ngày, chi phí y tế và phụ phí của chủ trong kỳ
 * @returns OwnerCostResponseDto
 */
export function toOwnerCost(
  owner: { id: string; fullName: string },
  source: FinanceSource,
): OwnerCostResponseDto {
  const horses = [
    ...new Map(
      [...source.dailyFees, ...source.medicalCharges, ...source.surcharges].map(
        (row) => [row.horseId, row.horseName],
      ),
    ),
  ]
    .map(([horseId, horseName]): OwnerCostHorseDto => {
      const fee = source.dailyFees.filter((row) => row.horseId === horseId);
      const medical = source.medicalCharges.filter(
        (row) => row.horseId === horseId,
      );
      const dailyFee = sumOf(fee.map((row) => row.dailyFee));
      const medicalCost = sumOf(medical.map((row) => row.medicalCost));
      const surcharge = sumOf(
        source.surcharges
          .filter((row) => row.horseId === horseId)
          .map((row) => row.surcharge),
      );
      return {
        horseId,
        horseName,
        billedDays: fee.reduce((sum, row) => sum + row.billedDays, 0),
        dailyFee,
        visitCount: medical.reduce((sum, row) => sum + row.visitCount, 0),
        medicalCost,
        surcharge,
        total: dailyFee + medicalCost + surcharge,
      };
    })
    .sort(
      (a, b) =>
        a.horseName.localeCompare(b.horseName) ||
        a.horseId.localeCompare(b.horseId),
    );
  const dailyFee = sumOf(horses.map((horse) => horse.dailyFee));
  const medicalCost = sumOf(horses.map((horse) => horse.medicalCost));
  const surcharge = sumOf(horses.map((horse) => horse.surcharge));
  return {
    ownerId: owner.id,
    ownerName: owner.fullName,
    from: source.period.from,
    to: source.period.to,
    dailyFee,
    medicalCost,
    surcharge,
    total: dailyFee + medicalCost + surcharge,
    prizeMoney: 0,
    horses,
  };
}

/**
 * Dựng báo cáo tài chính CLB
 *
 * - Tổng của CLB gồm mọi ngựa, kể cả các ngày và buổi khám không có chủ
 * - Bảng từng chủ gồm mọi chủ có ngựa còn ở CLB trong kỳ hoặc có buổi khám trong kỳ, sắp theo tên; mỗi chủ chỉ cộng phần của chủ đó
 * - Phần không có chủ (ownerId null) gom vào unowned, kèm tổng số ngày tính phí
 *
 * @param source Phí ngày, chi phí y tế và phụ phí của mọi chủ trong kỳ
 * @param supplies Giá trị vật tư nhập vào và đã dùng trong kỳ
 * @returns ClubFinanceResponseDto
 */
export function toClubFinance(
  source: FinanceSource,
  supplies: SupplyValueRow,
): ClubFinanceResponseDto {
  const owners = [
    ...new Map(
      [
        ...source.dailyFees,
        ...source.medicalCharges,
        ...source.surcharges,
      ].flatMap((row) =>
        row.ownerId === null ? [] : [[row.ownerId, row.ownerName ?? '']],
      ),
    ),
  ]
    .sort(
      ([aId, aName], [bId, bName]) =>
        aName.localeCompare(bName) || aId.localeCompare(bId),
    )
    .map(([ownerId, ownerName]): FinanceOwnerDto => {
      const dailyFee = sumOf(
        source.dailyFees
          .filter((row) => row.ownerId === ownerId)
          .map((row) => row.dailyFee),
      );
      const medicalCost = sumOf(
        source.medicalCharges
          .filter((row) => row.ownerId === ownerId)
          .map((row) => row.medicalCost),
      );
      const surcharge = sumOf(
        source.surcharges
          .filter((row) => row.ownerId === ownerId)
          .map((row) => row.surcharge),
      );
      return {
        ownerId,
        ownerName,
        dailyFee,
        medicalCost,
        surcharge,
        total: dailyFee + medicalCost + surcharge,
      };
    });
  const dailyFee = sumOf(source.dailyFees.map((row) => row.dailyFee));
  const medicalCost = sumOf(
    source.medicalCharges.map((row) => row.medicalCost),
  );
  const surcharge = sumOf(source.surcharges.map((row) => row.surcharge));
  const unownedFees = source.dailyFees.filter((row) => row.ownerId === null);
  const unownedDailyFee = sumOf(unownedFees.map((row) => row.dailyFee));
  const unownedMedicalCost = sumOf(
    source.medicalCharges
      .filter((row) => row.ownerId === null)
      .map((row) => row.medicalCost),
  );
  const unownedSurcharge = sumOf(
    source.surcharges
      .filter((row) => row.ownerId === null)
      .map((row) => row.surcharge),
  );
  return {
    from: source.period.from,
    to: source.period.to,
    ownerCharges: {
      dailyFee,
      medicalCost,
      surcharge,
      total: dailyFee + medicalCost + surcharge,
    },
    supplies: {
      purchased: Number(supplies.purchased),
      used: Number(supplies.used),
    },
    prizeMoney: 0,
    owners,
    unowned: {
      billedDays: unownedFees.reduce((sum, row) => sum + row.billedDays, 0),
      dailyFee: unownedDailyFee,
      medicalCost: unownedMedicalCost,
      surcharge: unownedSurcharge,
      total: unownedDailyFee + unownedMedicalCost + unownedSurcharge,
    },
  };
}

/**
 * Cộng các số tiền VND
 *
 * @param values Các số tiền dạng số hoặc chuỗi số nguyên
 * @returns Tổng số tiền
 */
function sumOf(values: Array<string | number>): number {
  return values.reduce<number>((sum, value) => sum + Number(value), 0);
}
