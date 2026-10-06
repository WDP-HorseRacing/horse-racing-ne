# Câu hỏi và bàn giao cho Flow 2 (2026-09-30)

## 1. Cường độ buổi tập cho ngựa "Cần theo dõi"

Bối cảnh: đặc tả Flow 1 (mục III.4) có ghi: ngựa đang "Cần theo dõi" (có dấu hiệu bất thường nhưng chưa xác định bệnh) chỉ được tập cường độ Nhẹ và Trung bình, và không được đua. Mô hình cũ có cột `training_sessions.intensity`. Khi chuyển sang mô hình lớp học thì cột này không còn dùng nữa (entity đã bỏ field; cột vẫn còn trong DB và cho phép null). Vì vậy hiện ngựa Cần theo dõi tập được mọi buổi.

Ví dụ: Winx đang Cần theo dõi. Lớp của Winx có buổi chạy tốc độ (Nặng) vào thứ 5. Hiện tại Winx vẫn được xếp vào buổi đó.

1.1. Có thêm lại cường độ cho buổi tập không?

- A. Có. Mỗi buổi có `intensity` (LIGHT / MODERATE / HEAVY), áp cho cả lớp.
- B. Không. Bỏ luật cường độ, Cần theo dõi chỉ còn nghĩa là "không được đua" (khi đó bên mình sẽ sửa lại docs Flow 1).

1.2. Nếu chọn A: ngựa Cần theo dõi gặp buổi Nặng thì xử lý thế nào?

- A. Hệ thống tự đánh lượt của con ngựa đó là `INELIGIBLE` cho riêng buổi đó, lý do "Cần theo dõi". Các ngựa khác tập bình thường.
- B. Hệ thống chỉ cảnh báo, để Head Trainer tự loại ngựa ra bằng tay.

## 2. Phần thông báo (bên mình đã làm, 2026-10-06)

Phần này không còn bàn giao cho Flow 2. Bên mình đã làm xong trên nhánh `truong-mongo`:

- Thông báo lưu ở MongoDB (collection `notifications`), chống trùng theo `eventId` + người nhận.
- 5 route đọc đã chạy: `GET /notifications` (phân trang cursor: truyền `nextCursor` vào `before`), `GET /notifications/unread-count`, `GET /notifications/:id`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- Mỗi thông báo có `resource { type, id }` (`HORSE`, `MEDICAL_CASE`, `TRAINING_LOCK`) để mở đúng màn hình.
- Push FCM: app đăng ký token qua `PUT /me/devices`, gỡ qua `DELETE /me/devices/:token`; gửi qua BullMQ có retry.
- Event nghiệp vụ đi qua outbox (Postgres) nên không mất khi restart.

Nếu Flow 2 cần phát thông báo mới:

1. Trong transaction của nghiệp vụ: `await this.events.publish(manager, TÊN_EVENT, { eventId: randomUUID(), ... })`.
2. Thêm listener ở `src/modules/notifications/delivery/listeners/` với `@OnEvent(TÊN_EVENT, OUTBOX_LISTENER_OPTIONS)`, gọi `NotificationsService.send()`.
3. Listener phải chịu được việc nhận lặp một event (xem guide mục 9).

Nợ còn lại: `docs/mongo-notifications-debt.md`.

## 3. Lỗi trong module training (phát hiện khi rà Flow 3)

1. `session-participants.service.ts` (bắt đầu lượt tập): khi ngựa bị khóa hoặc không đủ điều kiện, code gán `CANCELLED_BY_LOCK` / `INELIGIBLE`, gọi `manager.save(participant)` rồi `throw ConflictException` trong **cùng transaction**. Transaction rollback nên trạng thái mới không được lưu; lượt tập vẫn ở trạng thái cũ.
   - A. Lưu trạng thái rồi trả 200 kèm lượt tập đã chuyển trạng thái (không throw).
   - B. Giữ 409 nhưng lưu trạng thái ở transaction riêng trước khi throw.
2. Điểm danh (check-in) không kiểm khóa huấn luyện hay sức khỏe; chỉ lúc bắt đầu mới kiểm. Có cần kiểm ở check-in không?
