/**
 * Trạng thái sự cố tại chuồng
 *
 * - OPEN: đang mở, Head Trainer của khu chưa đóng
 * - RESOLVED: Head Trainer đã đóng kèm kết quả xử lý
 */
export enum IncidentStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}
