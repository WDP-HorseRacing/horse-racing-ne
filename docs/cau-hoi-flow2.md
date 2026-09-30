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

## 2. Bàn giao phần thông báo

Đã thống nhất: phần thông báo do Flow 2 làm.

Hiện trạng:

- Flow 1 và Flow 3 đã ghi thông báo vào bảng `notifications` (chống trùng theo `event_id` + người nhận) và bắn socket `notification.created` (namespace `/events`, token gửi ở `auth.token`). Chỗ ghi nằm ở `NotificationsService.send()`.
- 5 route đọc vẫn trả 501: `GET /notifications`, `GET /notifications/unread-count`, `GET /notifications/:id`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`. Ai offline lúc có thông báo thì không xem lại được.
- Bảng `notifications` chưa có index theo người nhận. Nên thêm `(recipient_id, created_at DESC)` và một index riêng cho phần chưa đọc (`WHERE read_at IS NULL`).
- Chưa thử client socket thật.

Đề xuất bên mình đã bàn (tham khảo, bạn chốt):

- Bảng `notifications` là nguồn chuẩn. Socket.IO chỉ giao "tối đa một lần" và không gửi bù khi client kết nối lại, nên bắt buộc có API đọc.
- Tách interface `NotificationChannel` (`deliver(rows)`). Có `RealtimeChannel` trước. Sau này thêm `FcmChannel` cho mobile khi app chạy nền hoặc đã tắt: bảng `user_devices`, gửi qua BullMQ để có retry, xóa token khi FCM báo `UNREGISTERED` / `INVALID_ARGUMENT`. Làm vậy thì không phải sửa `send()`.
- Danh sách sắp mới nhất trước, lọc `unreadOnly` và `priority`.
- Có liên kết tới dữ liệu gốc để bấm vào mở đúng màn hình (ví dụ `resourceType` + `resourceId`). Thiết kế sao cho thêm loại thông báo mới không cần migration.

## 3. Lỗi trong module training (phát hiện khi rà Flow 3)

1. `session-participants.service.ts` (bắt đầu lượt tập): khi ngựa bị khóa hoặc không đủ điều kiện, code gán `CANCELLED_BY_LOCK` / `INELIGIBLE`, gọi `manager.save(participant)` rồi `throw ConflictException` trong **cùng transaction**. Transaction rollback nên trạng thái mới không được lưu; lượt tập vẫn ở trạng thái cũ.
   - A. Lưu trạng thái rồi trả 200 kèm lượt tập đã chuyển trạng thái (không throw).
   - B. Giữ 409 nhưng lưu trạng thái ở transaction riêng trước khi throw.
2. Điểm danh (check-in) không kiểm khóa huấn luyện hay sức khỏe; chỉ lúc bắt đầu mới kiểm. Có cần kiểm ở check-in không?
