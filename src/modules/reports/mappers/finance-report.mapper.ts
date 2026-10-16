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
 * - Mỗi ngựa có ít nhất một ngày còn ở CLB dưới tên chủ trong kỳ, hoặc có bệnh án của chủ đóng trong kỳ, một dòng; kể cả khi không phát sinh chi phí
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
        caseCount: medical.reduce((sum, row) => sum + row.caseCount, 0),
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
 * - Chi phí y tế toàn CLB gồm cả bệnh án đóng lúc ngựa không có chủ; bảng từng chủ chỉ cộng bệnh án của chủ đó
 * - Bảng từng chủ gồm mọi chủ có ngựa còn ở CLB trong kỳ hoặc có bệnh án đóng trong kỳ, sắp theo tên
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
