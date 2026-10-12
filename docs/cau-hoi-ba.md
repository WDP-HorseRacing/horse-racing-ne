# Câu hỏi cho BA

> Cập nhật: 12/10/2026

BE cần BA xác nhận các luật dưới. Mỗi câu có phương án BE đang làm để BA chọn nhanh.

## 1. Phạm vi xem của Head Trainer

Đặc tả cũ: Head Trainer xem toàn câu lạc bộ, chỉ thao tác ngựa khu mình. BE đang làm: Head Trainer (không kiêm Club Manager, Veterinarian) chỉ thấy khu mình ở **danh sách khu chuồng** (`GET /barns`) và **bảng điều khiển y tế** (`GET /medical/dashboard`, chọn khu khác trả 403).

Các màn xem khác vẫn cho Head Trainer xem toàn câu lạc bộ, trong đó có hai màn trùng dữ liệu với bảng điều khiển: **lịch khám** (`GET /medical/checkups`) và **hàng đợi yêu cầu khám** (`GET /exam-requests`). Ngoài ra: chi tiết khu, ô chuồng, danh sách ngựa, sự cố.

- A. Chỉ giới hạn danh sách khu và bảng điều khiển y tế (đang làm).
- B. Giới hạn thêm lịch khám và hàng đợi yêu cầu khám (cùng dữ liệu với bảng điều khiển).
- C. Giới hạn mọi màn xem của Head Trainer về khu mình phụ trách.
- D. Quay lại xem toàn câu lạc bộ như đặc tả cũ.
