# Nợ kỹ thuật: MongoDB, thông báo, outbox

Cập nhật: 2026-10-06 (sau đợt dọn kiến trúc).

## 1. Tự xóa thông báo cũ (TTL)

Hiện giữ vĩnh viễn. Khi cần tự xóa:

- Thêm vào `notification.schema.ts`:
  `NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: N, name: 'notifications_read_ttl' })`
- Thông báo chưa đọc (`readAt: null`) không bị TTL xóa; chỉ thông báo đã đọc quá N giây bị xóa.
- Đổi N sau này: `db.runCommand({ collMod: 'notifications', index: { name: 'notifications_read_ttl', expireAfterSeconds: M } })`.

## 2. Chống ghi trùng điểm đo khi làm API ingest

`performance_metrics` là time-series nên không có unique index. Bảng Postgres cũ có
unique `(session_participant_id, recorded_at, source_id)`. Khi làm `POST /performance/metrics`
(đang 501) cần chống trùng ở tầng ghi, ví dụ:

- A. Cảm biến gửi lô có `batchId`; lưu `batchId` đã nhận vào collection thường có unique index, nhận trùng thì bỏ cả lô.
- B. Trước khi ghi, đọc các `recordedAt` đã có trong khoảng thời gian của lô cho cùng `series` rồi bỏ điểm trùng.

Ngoài ra ingest phải:
- Lưu tốc độ tối đa 3 chữ số thập phân.
- Điền đủ `series.horseId`, `series.sessionId` theo lượt tập.

## 3. Push FCM mất khi Redis lỗi đúng lúc đưa vào hàng đợi

`NotificationsService.send` lưu thông báo rồi mới giao qua các kênh. Nếu `FcmChannel`
lỗi (Redis down) thì chỉ log. Outbox giao lại event thì `send()` thấy thông báo đã có
nên không giao lại, push của thông báo đó mất. Thông báo vẫn có trong inbox và đã đẩy socket.

Hướng sửa khi cần: đưa việc đẩy push vào outbox riêng, hoặc job định kỳ quét thông báo
mới chưa có job push.

## 4. Lỗi FCM `invalid-argument`

Chỉ log, không xóa token, vì lỗi này có thể do payload. Theo dõi log; nếu gặp nhiều
với token cũ thì cân nhắc xóa token.

## 5. Đồng bộ badge giữa các thiết bị

Đánh dấu đã đọc trên một máy không đẩy socket cho máy khác của cùng người dùng.
Client gọi lại `GET /notifications/unread-count` khi mở app. Khi cần: phát
`notification.read` qua room `user:<id>`.

## 6. Event outbox thất bại hẳn

Event lỗi đủ 10 lần có `dead_at` và dừng thử. Chưa có màn hình hay cảnh báo. Xem bằng:
`SELECT event_name, attempts, last_error FROM outbox_events WHERE dead_at IS NOT NULL`.
Giao lại: `UPDATE outbox_events SET dead_at = NULL, attempts = 0, next_attempt_at = now() WHERE id = ...`.

## 7. Dọn token FCM cũ

Firebase khuyến nghị coi token không cập nhật khoảng 1–2 tháng là cũ (token Android hết hạn sau 270 ngày).
Khi cần: cron xóa `user_devices` có `updatedAt` cũ hơn 60 ngày, và app gọi lại `PUT /me/devices` mỗi lần mở.
Nguồn: https://firebase.google.com/docs/cloud-messaging/manage-tokens

## 8. Mức cảnh báo của điểm đo

Hiện chỉ có hằng `NORMAL_ALERT_LEVEL = 'NORMAL'` (`performance/constants`). Khi làm API ingest,
chốt danh sách mức cảnh báo rồi đổi thành enum trong `performance/enums/`.

## 9. Integration test thỉnh thoảng hết giờ chờ container

Lỗi `Timed out after 10000ms while waiting for container ports to be bound to the host`: Jest chạy song song
nhiều suite, mỗi suite bật container riêng (Postgres, Mongo, Redis). Hướng sửa: giới hạn `maxWorkers`
trong `test/jest-integration.json` hoặc tăng thời gian chờ khởi động container.
