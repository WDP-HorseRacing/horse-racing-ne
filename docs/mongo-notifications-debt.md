# Nợ kỹ thuật: MongoDB, thông báo, outbox

Cập nhật: 2026-10-07.

## 1. Tự xóa thông báo cũ (TTL)

Hiện giữ vĩnh viễn. Khi cần tự xóa:

- Thêm vào `notification.schema.ts`:
  `NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: N, name: 'notifications_read_ttl' })`
- Thông báo chưa đọc (`readAt: null`) không bị TTL xóa; chỉ thông báo đã đọc quá N giây bị xóa.
- Đổi N sau này: `db.runCommand({ collMod: 'notifications', index: { name: 'notifications_read_ttl', expireAfterSeconds: M } })`.

## 2. ~~Chống ghi trùng điểm đo khi làm API ingest~~ (đã làm)

`POST /session-participants/:id/metrics` và `/metrics/batch` bỏ điểm trùng `(cảm biến, thời điểm đo)` trong lô,
rồi đọc các `recordedAt` của lô đã lưu cho cùng lượt tập để bỏ điểm đã có (hướng B). Tốc độ làm tròn 3 chữ số,
`meta.horseId`, `meta.sessionId` điền theo lượt tập.

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

## 8. ~~Mức cảnh báo của điểm đo~~ (đã làm)

Enum `MetricAlertLevel` (`NORMAL` / `WARNING` / `CRITICAL`) ở `performance/enums/`.

## 9. Integration test thỉnh thoảng hết giờ chờ container

Lỗi `Timed out after 10000ms while waiting for container ports to be bound to the host`: Jest chạy song song
nhiều suite, mỗi suite bật container riêng (Postgres, Mongo, Redis). Hướng sửa: giới hạn `maxWorkers`
trong `test/jest-integration.json` hoặc tăng thời gian chờ khởi động container.

## 10. Route nhận điểm đo đang public

`POST /session-participants/:id/metrics` và `/metrics/batch` gắn `@Public()` để script giả lập (`pnpm sim`)
gửi số đo mà không cần token (token Keycloak mặc định hết hạn sau 5 phút, buổi tập dài hơn).

Hệ quả: ai biết id của một lượt tập đang ONGOING cũng gửi được số đo giả, và số đo vượt ngưỡng sẽ bắn
thông báo KHẨN cho bác sĩ và Head Trainer. Không có giới hạn tần suất.

Trước khi deploy server thật, chọn một hướng:

- A. Khóa thiết bị: header `X-Device-Key` so với biến môi trường (hoặc bảng thiết bị có cấp/thu hồi key).
- B. Bỏ `@Public()`, script đăng nhập bằng tài khoản Groom/HT (client đã bật `directAccessGrantsEnabled`)
  và tự làm mới token bằng refresh token.

## 11. Mỗi lô có điểm CRITICAL ghi một dòng outbox

Lượt tập đang vượt ngưỡng thì mỗi lô (mỗi giây với script giả lập) ghi thêm một event
`performance.metric.critical` vào outbox. Thông báo không trùng vì `eventId` cố định theo lượt tập,
nhưng outbox phình theo số giây vượt ngưỡng (dọn sau 7 ngày).

Khi cần: trước khi publish, kiểm lượt tập đã có điểm CRITICAL trong Mongo chưa; có rồi thì bỏ qua.

