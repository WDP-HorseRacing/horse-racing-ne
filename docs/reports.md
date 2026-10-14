# Báo cáo

> Cập nhật: 14/10/2026

## I. Đề bài liên quan

- **HEAD TRAINER**: xem bảng tiến độ và biểu đồ thể lực tổng quan của toàn bộ chiến mã trong câu lạc bộ.
- **HORSE OWNER**: theo dõi lịch trình tập luyện, sức khỏe; nhận báo cáo chi phí.
- **CLUB MANAGER**: xem báo cáo tổng quan về hiệu suất huấn luyện, chi phí vận hành chuồng trại.

## II. Luật chung

1. Khoảng ngày `?from&to` theo lịch CLB, lấy trọn cả hai ngày. Bỏ trống `to` là hôm nay; bỏ trống `from` là 30 ngày tính tới `to`. `from` sau `to`: 400.

## III. Dashboard `GET /reports/dashboard`

1. Club Manager, Head Trainer, bác sĩ xem được. Mặc định toàn CLB; `?barnId` chỉ một khu; `?mine=true` chỉ các khu người gọi phụ trách.
2. Chỉ tính ngựa đang hoạt động, hồ sơ chưa xóa.
3. Đàn ngựa: tổng số, số theo bốn trạng thái sức khỏe, số đang bị khóa huấn luyện.
4. Tập luyện trong kỳ (buổi có giờ bắt đầu trong kỳ): số buổi đang diễn ra hoặc đã xong có ngựa trong phạm vi; số lượt hoàn thành, vắng, không đủ điều kiện (gồm cả lượt hủy do khóa huấn luyện); số lượt hoàn thành theo cường độ.
5. Biểu đồ theo tuần (thứ Hai đầu tuần, lịch CLB): số lượt hoàn thành, nhịp tim và tốc độ trung bình, số điểm đo vượt ngưỡng. Chỉ có những tuần có lượt hoàn thành hoặc có điểm đo.
6. Bảng từng ngựa: khu, trạng thái sức khỏe, cờ khóa huấn luyện, số lượt hoàn thành, nhịp tim và tốc độ trung bình, cao nhất, số điểm đo vượt ngưỡng trong kỳ, cân nặng gần nhất (không tính số đo đã xóa).
7. Nhịp tim trung bình làm tròn tới số nguyên, tốc độ tới 3 chữ số thập phân; không có điểm đo thì để trống.

## IV. Báo cáo từng ngựa

1. `GET /reports/horses/:horseId/progress` và `GET /reports/horses/:horseId/health`: Club Manager, Head Trainer, bác sĩ, chủ của ngựa xem được. Phạm vi xem giống hồ sơ ngựa: chủ chỉ xem ngựa mình đang sở hữu, ngoài phạm vi trả 404; Club Manager xem được cả hồ sơ đã xóa.
2. Tiến độ (`progress`), tính theo buổi có giờ bắt đầu trong kỳ:
   - Tổng kỳ: số lượt hoàn thành, vắng, không đủ điều kiện (gồm lượt hủy do khóa huấn luyện); tổng quãng đường kế hoạch và số phút tập (từ lúc bắt đầu tới lúc hoàn thành lượt, làm tròn phút) của các lượt hoàn thành; số lượt hoàn thành theo cường độ.
   - Biểu đồ tuần giống dashboard (III.5).
   - Từng lượt, sắp theo giờ buổi: tên buổi, giờ, loại buổi, cường độ, quãng đường, trạng thái, nhịp tim và tốc độ trung bình, cao nhất, số điểm đo vượt ngưỡng, đánh giá (điểm, nhận xét), thời gian chạy thử tốt nhất.
3. Sức khỏe (`health`):
   - Trạng thái sức khỏe hiện tại.
   - Các lần đổi trạng thái sức khỏe trong kỳ (lấy từ nhật ký thao tác), kèm lý do.
   - Số đo trong kỳ, không tính số đo đã xóa.
   - Ca bệnh có thời gian giao với kỳ (ca chưa đóng coi như còn kéo dài); không kèm chi phí.
   - Chấn thương ghi ở phiếu khám chưa hủy có ngày khám trong kỳ.
   - Khóa huấn luyện có thời gian giao với kỳ; khóa chưa gỡ coi như còn kéo dài (ngày dự kiến gỡ không tự gỡ khóa).
   - Mỗi danh sách sắp theo thời gian tăng dần.
