import type {
  ClubFinanceResponseDto,
  FinanceOwnerDto,
  OwnerCostHorseDto,
  OwnerCostResponseDto,
} from '../dto/finance-report.dto';
import type {
  DailyFeeRow,
  MedicalChargeRow,
  OwnedHorseRow,
  ReportPeriod,
  SupplyValueRow,
} from '../types/report.types';

/**
 * Số liệu đã đọc để dựng báo cáo chi phí
 */
export interface FinanceSource {
  period: ReportPeriod;
  ownedHorses: OwnedHorseRow[];
  dailyFees: DailyFeeRow[];
  medicalCharges: MedicalChargeRow[];
}

/**
 * Dựng báo cáo chi phí của một chủ ngựa
 *
 * - Mỗi ngựa chủ sở hữu trong kỳ một dòng, kể cả khi không phát sinh chi phí
 *
 * @param owner Chủ của báo cáo
 * @param source Ngựa sở hữu, phí ngày và chi phí y tế của chủ trong kỳ
 * @returns OwnerCostResponseDto
 */
export function toOwnerCost(
  owner: { id: string; fullName: string },
  source: FinanceSource,
): OwnerCostResponseDto {
  const horses = [
    ...new Map(source.ownedHorses.map((row) => [row.horseId, row.horseName])),
  ]
    .map(([horseId, horseName]): OwnerCostHorseDto => {
      const fee = source.dailyFees.filter((row) => row.horseId === horseId);
      const medical = source.medicalCharges.filter(
        (row) => row.horseId === horseId,
      );
      const dailyFee = sumOf(fee.map((row) => row.dailyFee));
      const medicalCost = sumOf(medical.map((row) => row.medicalCost));
      return {
        horseId,
        horseName,
        billedDays: fee.reduce((sum, row) => sum + row.billedDays, 0),
        dailyFee,
        caseCount: medical.reduce((sum, row) => sum + row.caseCount, 0),
        medicalCost,
        total: dailyFee + medicalCost,
      };
    })
    .sort(
      (a, b) =>
        a.horseName.localeCompare(b.horseName) ||
        a.horseId.localeCompare(b.horseId),
    );
  const dailyFee = sumOf(horses.map((horse) => horse.dailyFee));
  const medicalCost = sumOf(horses.map((horse) => horse.medicalCost));
  return {
    ownerId: owner.id,
    ownerName: owner.fullName,
    from: source.period.from,
    to: source.period.to,
    dailyFee,
    medicalCost,
    total: dailyFee + medicalCost,
    prizeMoney: 0,
    horses,
  };
}

/**
 * Dựng báo cáo tài chính CLB
 *
 * - Chi phí y tế toàn CLB gồm cả bệnh án đóng lúc ngựa không có chủ; bảng từng chủ chỉ cộng bệnh án của chủ đó
 * - Bảng từng chủ gồm mọi chủ có ngựa trong kỳ
 *
 * @param source Ngựa sở hữu, phí ngày và chi phí y tế của mọi chủ trong kỳ
 * @param supplies Giá trị vật tư nhập vào và đã dùng trong kỳ
 * @returns ClubFinanceResponseDto
 */
export function toClubFinance(
  source: FinanceSource,
  supplies: SupplyValueRow,
): ClubFinanceResponseDto {
  const owners = [
    ...new Map(source.ownedHorses.map((row) => [row.ownerId, row.ownerName])),
  ].map(([ownerId, ownerName]): FinanceOwnerDto => {
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
    return {
      ownerId,
      ownerName,
      dailyFee,
      medicalCost,
      total: dailyFee + medicalCost,
    };
  });
  const dailyFee = sumOf(source.dailyFees.map((row) => row.dailyFee));
  const medicalCost = sumOf(
    source.medicalCharges.map((row) => row.medicalCost),
  );
  return {
    from: source.period.from,
    to: source.period.to,
    ownerCharges: { dailyFee, medicalCost, total: dailyFee + medicalCost },
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
