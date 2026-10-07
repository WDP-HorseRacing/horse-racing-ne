# Câu hỏi và bàn giao cho Flow 2

> Cập nhật: 07/10/2026

## 1. Cường độ buổi tập cho ngựa "Cần theo dõi" (đã chốt, đã làm)

Câu hỏi: ngựa "Cần theo dõi" chỉ được tập Nhẹ và Trung bình (Flow 1 mục III.2), nhưng mô hình lớp học không còn cường độ buổi tập nên không chặn được.

Đã chốt và đã làm:

- 1.1 chọn A: mỗi buổi có `intensity` bắt buộc (`LIGHT` / `MODERATE` / `HEAVY`), áp cho cả lớp. Thiếu khi tạo buổi trả 400. Cột cũ `training_sessions.intensity` dùng lại, đặt `NOT NULL`; dòng cũ điền `MODERATE`.
- 1.2 chọn A: ngựa Cần theo dõi gặp buổi `HEAVY` thì lượt tự đánh `INELIGIBLE`, lý do `HEALTH_UNDER_OBSERVATION`. Các ngựa khác tập bình thường.
- Chặn ở cùng các bước như khóa huấn luyện: publish buổi, ghi danh vào lớp, điểm danh, bắt đầu.

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

## 3. Lỗi trong module training (đã sửa)

1. Bắt đầu lượt tập: code đánh `CANCELLED_BY_LOCK` / `INELIGIBLE` rồi ném 409 trong cùng transaction nên trạng thái bị rollback. Đã sửa: lưu trạng thái, commit, rồi mới trả 409 (câu báo lỗi giữ nguyên).
2. Điểm danh chưa kiểm khóa và sức khỏe. Đã sửa theo Q2 Flow 3: điểm danh kiểm giống lúc bắt đầu; không đủ điều kiện thì lưu trạng thái và trả 409 "Ngựa không còn đủ điều kiện để điểm danh".
