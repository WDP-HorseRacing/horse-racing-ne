# Requirement gốc

> Bản gốc của đề tài, chép nguyên văn. Mọi thay đổi nghiệp vụ và góp ý phải đối chiếu với file này.

**Hệ thống Quản lý Huấn luyện Ngựa đua - Racehorse Training & Management System**

## Actors

- Head Trainer
- Veterinarian
- Groom / Stable Hand
- Horse Owner
- Club Manager

## Main features

### Head Trainer (Huấn luyện viên Trưởng)

- Xem bảng tiến độ và biểu đồ thể lực tổng quan của toàn bộ chiến mã trong câu lạc bộ.
- Lập giáo án huấn luyện chi tiết (cự ly, khối lượng, mặt sân) theo từng giai đoạn cho từng con ngựa.
- Phân công lịch tập luyện hàng ngày cho đội ngũ chăm sóc và quản lý lượt chạy thử.
- Xem cảnh báo vượt ngưỡng thể lực hoặc nguy cơ chấn thương dựa trên dữ liệu nhịp tim/vận tốc realtime.
- Đánh giá phong độ, ghi nhận chỉ số buổi tập và đưa ra nhận xét chuyên môn sau mỗi buổi tập.
- Lựa chọn chiến mã và đăng ký tham gia các giải đua phù hợp.

### Veterinarian (Bác sĩ Thú y)

- Xem sơ đồ trạng thái sức khỏe (Đủ điều kiện, Cần theo dõi, Chấn thương, Cách ly) của toàn bộ đàn ngựa trên giao diện chuồng trại.
- Ghi nhận hồ sơ khám bệnh, chẩn đoán chi tiết và cập nhật phác đồ điều trị/đơn thuốc.
- Đánh dấu vị trí chấn thương trên mô hình cơ/xương 3D của ngựa để theo dõi diễn biến phục hồi.
- Đặt lệnh "Khóa huấn luyện" khẩn cấp đối với ngựa chấn thương để ngăn chặn xếp lịch bài tập nặng.
- Theo dõi và nhận thông báo tự động về lịch tiêm phòng, tẩy giun, kiểm tra móng (Farrier) định kỳ.

### Groom / Stable Hand (Nhân viên Chăm sóc & Chuồng trại)

- Xem sơ đồ phân bổ vị trí chuồng trại và lịch trình sinh hoạt hàng ngày của từng con ngựa.
- Xem chi tiết khẩu phần ăn (ngũ cốc, cỏ, vitamin) được duyệt cho từng bữa trong ngày.
- Đánh dấu xác nhận hoàn thành công việc (Cho ăn, Vệ sinh chuồng, Tắm rửa, Ngâm chân nước đá).
- Gửi báo cáo sự cố đột xuất tại chuồng (Ngựa bỏ ăn, Có dấu hiệu đau bụng/sốt, Móng bị xước) kèm hình ảnh thực tế.
- Theo dõi danh sách vật tư (Thức ăn, Thuốc, Dụng cụ) tại khu vực phụ trách để đề xuất bổ sung.

### Horse Owner (Chủ sở hữu Ngựa)

- Xem hồ sơ lý lịch, dòng dõi (Pedigree) và lịch sử thành tích thi đấu của ngựa thuộc sở hữu.
- Theo dõi chỉ số sức khỏe, cân nặng và trạng thái sẵn sàng thi đấu theo thời gian thực.
- Xem lịch trình tập luyện, video các buổi đua thử và nhật ký nhận xét từ HLV Trưởng.
- Nhận báo cáo tổng hợp chi phí nuôi dưỡng, y tế và doanh thu tiền thưởng định kỳ.

### Club Manager (Quản lý Câu lạc bộ)

- Quản lý danh mục tổng (Danh sách ngựa, Danh sách nhân sự, Danh mục vật tư y tế & thức ăn).
- Phân quyền truy cập và chức năng thao tác (RBAC) cho từng vai trò trong hệ thống.
- Xem báo cáo tổng quan về hiệu suất huấn luyện, chi phí vận hành chuồng trại và doanh thu giải đấu.
- Theo dõi nhật ký thao tác hệ thống (Audit Log) để đảm bảo an toàn thông tin và tính minh bạch.

## Must have

- Flow 1: Luồng Quản lý Hồ sơ & Lý lịch Ngựa (REQUIRED)
- Flow 2: Luồng Lập & Thực hiện Giáo án Huấn luyện (REQUIRED)
- Flow 3: Luồng Quản lý Y tế & Xử lý Chấn thương (REQUIRED)

## Nice to have

- Flow 4: Luồng Chăm sóc Chuồng trại & Dinh dưỡng Hàng ngày (OPTIONAL)
- Flow 5: Luồng Đăng ký Thi đấu & Báo cáo Thành tích (OPTIONAL)
