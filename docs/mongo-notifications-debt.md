# Nợ kỹ thuật: MongoDB, thông báo, outbox

Cập nhật: 2026-10-07.

## 1. Tự xóa thông báo cũ (TTL)

Hiện giữ vĩnh viễn. Khi cần tự xóa:

- Thêm vào `notification.schema.ts`:
  `NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: N, name: 'notifications_read_ttl' })`
- Thông báo chưa đọc (`readAt: null`) không bị TTL xóa; chỉ thông báo đã đọc quá N giây bị xóa.
- Đổi N sau này: `db.runCommand({ collMod: 'notifications', index: { name: 'notifications_read_ttl', expireAfterSeconds: M } })`.

## 2. Push FCM mất khi Redis sập

`NotificationDeliveryService.send` lưu thông báo, đẩy socket, rồi `PushChannel` đưa job vào hàng đợi BullMQ.
Kết nối BullMQ dùng `maxRetriesPerRequest: 5` (`bullConnectionOptions`): Redis rớt dưới khoảng 5 giây thì thêm job chờ rồi
chạy tiếp, push chỉ trễ. Redis sập lâu hơn thì thêm job lỗi sau khoảng 5 giây, lỗi chỉ được log. Thông báo vẫn có trong inbox
và đã đẩy socket, nhưng push của thông báo đó mất; outbox không giao lại vì listener không ném lỗi, và `send()` chỉ giao
thông báo vừa lưu mới.

Đánh đổi của số lần thử: mặc định của ioredis (20 lần) làm thêm job đứng chờ 238 giây, giữ cả hàng outbox phía sau
(gồm việc tự tạo yêu cầu khám từ cảnh báo chỉ số); 1 lần thì Redis rớt 2 giây cũng mất push. 5 lần: chờ tối đa khoảng
5 giây mỗi event.

Hướng gửi bù khi cần:
- Thêm `pushQueuedAt` vào thông báo; đưa job được thì đánh dấu.
- Push lỗi thì ném lỗi để outbox giao lại; lần giao lại chỉ đẩy push cho thông báo của `eventId` có `pushQueuedAt = null`
  (socket không đẩy lại, `jobId = notificationId` chống trùng job).
- Socket và push phải tách khỏi vòng lặp kênh chung vì xử lý lỗi khác nhau.
- Redis sập quá khoảng 17 phút thì mọi event có thông báo trong lúc đó bị `dead_at`: phải làm cảnh báo ở mục 4 cùng lúc.

## 3. Lỗi FCM `invalid-argument`

Chỉ log, không xóa token, vì lỗi này có thể do payload. Theo dõi log; nếu gặp nhiều
với token cũ thì cân nhắc xóa token.

## 4. Event outbox thất bại hẳn

Event lỗi đủ 10 lần có `dead_at` và dừng thử. Chưa có màn hình hay cảnh báo. Xem bằng:
`SELECT event_name, attempts, last_error FROM outbox_events WHERE dead_at IS NOT NULL`.
Giao lại: `UPDATE outbox_events SET dead_at = NULL, attempts = 0, next_attempt_at = now() WHERE id = ...`.

## 5. Route nhận điểm đo đang public

`POST /session-participants/:id/metrics` và `/metrics/batch` gắn `@Public()` để script giả lập (`pnpm sim`)
gửi số đo mà không cần token (token Keycloak mặc định hết hạn sau 5 phút, buổi tập dài hơn).

Hệ quả: ai biết id của một lượt tập đang ONGOING cũng gửi được số đo giả, và số đo vượt ngưỡng sẽ bắn
thông báo KHẨN cho bác sĩ và Head Trainer. Không có giới hạn tần suất.

Trước khi deploy server thật, chọn một hướng:

- A. Khóa thiết bị: header `X-Device-Key` so với biến môi trường (hoặc bảng thiết bị có cấp/thu hồi key).
- B. Bỏ `@Public()`, script đăng nhập bằng tài khoản Groom/HT (client đã bật `directAccessGrantsEnabled`)
  và tự làm mới token bằng refresh token.

## 6. Mỗi lô có điểm CRITICAL ghi một dòng outbox

Lượt tập đang vượt ngưỡng thì mỗi lô (mỗi giây với script giả lập) ghi thêm một event
`performance.metric.critical` vào outbox. Thông báo không trùng vì `eventId` cố định theo lượt tập,
nhưng outbox phình theo số giây vượt ngưỡng (dọn sau 7 ngày).

Khi cần: trước khi publish, kiểm lượt tập đã có điểm CRITICAL trong Mongo chưa; có rồi thì bỏ qua.

