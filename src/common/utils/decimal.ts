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

/**
 * Hiệu của hai số thập phân, định dạng đúng scale chữ số thập phân
 *
 * @param minuend Số bị trừ, dạng chuỗi
 * @param subtrahend Số trừ, dạng chuỗi
 * @param scale Số chữ số thập phân của kết quả
 * @returns Hiệu dạng chuỗi, vd "-12.50"
 * @throws Error Nếu một trong hai giá trị không phải số thập phân
 */
export function subtractDecimal(
  minuend: string,
  subtrahend: string,
  scale: number,
): string {
  return new ExactDecimal(minuend).minus(subtrahend).toFixed(scale);
}

/**
 * Tổng của hai số thập phân, định dạng đúng scale chữ số thập phân
 *
 * @param left Số hạng thứ nhất, dạng chuỗi
 * @param right Số hạng thứ hai, dạng chuỗi
 * @param scale Số chữ số thập phân của kết quả
 * @returns Tổng dạng chuỗi, vd "140.00"
 * @throws Error Nếu một trong hai giá trị không phải số thập phân
 */
export function addDecimal(left: string, right: string, scale: number): string {
  return new ExactDecimal(left).plus(right).toFixed(scale);
}

/**
 * So sánh hai số thập phân
 *
 * @param left Số thứ nhất, dạng chuỗi
 * @param right Số thứ hai, dạng chuỗi
 * @returns -1 nếu left nhỏ hơn, 0 nếu bằng, 1 nếu lớn hơn
 * @throws Error Nếu một trong hai giá trị không phải số thập phân
 */
export function compareDecimal(left: string, right: string): -1 | 0 | 1 {
  return new ExactDecimal(left).cmp(right) as -1 | 0 | 1;
}
