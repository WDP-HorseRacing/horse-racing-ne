import Decimal from 'decimal.js';

/**
 * Decimal dùng cho phép tính tiền và số đo: đủ chữ số để chia không mất độ chính xác, làm tròn nửa xa số 0 (như ROUND của Postgres với numeric).
 */
const ExactDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Tính trung bình của một tổng rồi làm tròn tới scale chữ số thập phân, nửa xa số 0
 *
 * - Cho cùng kết quả với `ROUND(AVG(x), scale)` của Postgres trên cột numeric
 *
 * @param sum Tổng các giá trị, dạng chuỗi số thập phân (nhận cả ký hiệu mũ, vd "1.5E+2")
 * @param count Số giá trị, lớn hơn 0
 * @param scale Số chữ số thập phân của kết quả
 * @returns Trung bình dạng chuỗi có đúng scale chữ số thập phân
 * @throws Error Nếu sum không phải số thập phân
 */
export function averageDecimal(
  sum: string,
  count: number,
  scale: number,
): string {
  return new ExactDecimal(sum).div(count).toFixed(scale);
}

/**
 * Định dạng một số thập phân với đúng scale chữ số thập phân, làm tròn nửa xa số 0 nếu dư
 *
 * @param value Số thập phân dạng chuỗi
 * @param scale Số chữ số thập phân của kết quả
 * @returns Chuỗi số, vd "12.250"
 * @throws Error Nếu value không phải số thập phân
 */
export function roundDecimal(value: string, scale: number): string {
  return new ExactDecimal(value).toFixed(scale);
}
