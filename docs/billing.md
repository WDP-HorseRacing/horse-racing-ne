# Phí nuôi ngựa theo ngày

> Cập nhật: 14/10/2026

## I. Đề bài liên quan

**HORSE OWNER**: nhận báo cáo tổng hợp chi phí nuôi dưỡng, y tế và doanh thu tiền thưởng định kỳ.

**Cách hiểu đề bài**

- Chi phí nuôi dưỡng tính theo phí ngày: CLB thu mỗi con ngựa một mức phí cố định mỗi ngày (gồm chuồng, thức ăn, nhân công, tập luyện). Chi phí y tế tính riêng theo từng bệnh án.

## II. Luật nghiệp vụ

1. Mức phí áp dụng chung cho mọi ngựa của CLB, đơn vị VND mỗi con mỗi ngày (số nguyên, không âm).
2. Mỗi mức phí có ngày hiệu lực; phí của một ngày là mức có ngày hiệu lực gần nhất mà không sau ngày đó. Ngày trước mức đầu tiên không có phí.
3. Chỉ Club Manager đặt, xem và xóa mức phí.
4. Ngày hiệu lực phải từ hôm nay trở đi (theo lịch CLB): 400. Hai mức không trùng ngày hiệu lực: 409.
5. Không sửa mức phí. Chỉ xóa được mức chưa có hiệu lực (ngày hiệu lực sau hôm nay); mức đã hiệu lực: 409.
6. Đặt và xóa mức phí đều ghi nhật ký thao tác.

## III. API

| Method | Path | Vai trò | Ghi chú |
|---|---|---|---|
| GET | `/daily-fees` | CM | Lịch sử mức phí, ngày hiệu lực mới nhất trước |
| POST | `/daily-fees` | CM | Đặt mức phí `{ effectiveFrom, dailyFee }` |
| DELETE | `/daily-fees/:id` | CM | Xóa mức chưa có hiệu lực |
