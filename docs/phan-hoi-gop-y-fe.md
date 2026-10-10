# Phản hồi góp ý Backend của FE (đợt 2)

> Cập nhật 10/10/2026. Trả lời file "Góp ý Backend từ phía FE" bản đối chiếu HEAD `181274e`. Code nằm ở nhánh `truong`. Mã mục (1.1, 1.2...) giữ đúng như file góp ý.

Đọc nhanh:

- **Phần 1:** những chỗ FE phải sửa theo, vì API hoặc hành vi đã đổi.
- **Phần 2:** từng mục 1.1–1.6. Ghi BE đã làm gì và chỗ nào khác đề xuất.
- **Phần 3:** nhóm "để sau demo". Không đổi so với đợt 1.

Đã kiểm:
- Build, unit test (1.319), integration test trên Postgres thật (265).
- Chạy thử trên app thật:
  - Body quá lớn trả 413.
  - Upload video lên MinIO local: đúng định dạng trả 200, sai định dạng trả 403.
- Chưa chạy thử trên app thật các luồng còn lại: trùng giờ, PATCH video, tạo lớp, thêm buổi.
- Chưa thử upload lên AWS S3 thật.

---

## 1. FE cần sửa theo

| # | Việc | Mục |
|---|---|---|
| 1 | Thêm lẻ một buổi (`POST /classes/:classId/sessions`) **bắt buộc gửi `subjectId`**, thiếu thì trả 400. `sessionType` thành tùy chọn, có gửi mà lệch loại buổi của môn thì trả 400 | 1.3 |
| 2 | Thêm buổi chạy thử thì gửi luôn `targetTimeMs` (tùy chọn, có thể `null`). BE tự tạo cấu hình chạy thử trong cùng request. **Không gọi thêm** `POST /training-sessions/:id/time-trial`, gọi sẽ nhận 409 "Buổi tập đã có cấu hình chạy thử" | 1.3 |
| 3 | Thêm buổi và đổi giờ buổi nháp có thể nhận 409 vì trùng lịch ngựa ở lớp khác. Hiện nguyên câu lỗi cho HLV | 1.1 |
| 4 | Khi PUT file lên link ký sẵn, gửi **đúng** header `Content-Type` trong `headers` mà `POST /media/upload-requests` trả về. Gửi khác thì kho trả 403 | 1.6 |
| 5 | Có thể bỏ phần FE tự so buổi nháp ở sheet ghi danh, vì BE đã chặn. Nếu giữ để báo sớm thì cũng không sao | 1.1 |

---

## 2. Từng mục

### 1.1. Trùng giờ so cả buổi nháp: đã làm, rộng hơn đề xuất

- **Lịch của ngựa ở một lớp** gồm những buổi thỏa đủ ba điều kiện:
  - Buổi đang Nháp, Đã công bố hoặc Đang diễn ra.
  - Chưa tới giờ bắt đầu.
  - Nằm trong khoảng ngựa học lớp đó, tính từ lúc ghi danh tới lúc rời lớp.
  - Buổi đã hủy, đã xong, đã qua giờ thì không tính.
- **Ghi danh:** so lịch của lớp này với lịch của ngựa ở các lớp khác, có tính cả buổi nháp. Trùng thì trả 409 với câu cũ: "Ngựa Công Phá đã có buổi tập trùng giờ ở lớp KD-01".
- **Thêm buổi, đổi giờ buổi nháp:** so với lịch ở lớp khác của **mọi ngựa đang học lớp này** vào giờ đó. Trùng thì trả 409, câu lỗi liệt kê **đủ** các ngựa trùng để HLV sửa một lần:

  > Trùng giờ với lịch của ngựa: Công Phá (lớp KD-01, 06:00 ngày 12/10/2026), Giả Nhân (lớp KD-03, 06:00 ngày 12/10/2026)

  Kiểm trùng với buổi khác trong cùng lớp vẫn chạy trước, câu lỗi giữ như cũ.
- **Công bố:** giữ nguyên, vẫn bỏ qua ngựa trùng và trả `skippedHorses`. Từ giờ trường hợp này gần như chỉ còn gặp ở dữ liệu cũ.
- Hai thao tác ghi lịch chạy cùng lúc trên cùng một ngựa giờ được xếp hàng. Ví dụ hai lớp cùng lúc thêm buổi trùng giờ cho chung một ngựa thì chỉ một bên qua.
- Tính trùng theo khoảng `[bắt đầu, kết thúc)`, chạm mép không tính, giống đợt 1.

### 1.2. Gắn video sau khi buổi xong: đã làm, có thêm thời hạn

- `PATCH /session-participants/:id/trial-results/:attemptNo`, body `{ "videoMediaId": "uuid" | null }`. Gửi `null` là gỡ video. Trả về kết quả chạy thử giống GET, có `videoUrl`.
- Chỉ Huấn luyện viên trưởng đang phụ trách lớp được gọi. Không kiểm ngựa thuộc khu, nên ngựa đã đổi khu vẫn gắn được.
- **Khác đề xuất, có thêm thời hạn:** chỉ gắn, đổi hoặc gỡ được trong **7 ngày** kể từ giờ kết thúc dự kiến của buổi.

| Trường hợp | Kết quả |
|---|---|
| Quá 7 ngày | 409 "Quá hạn gắn video chạy thử" |
| Buổi đã hủy | 409 "Buổi tập đã hủy, không sửa video chạy thử" |
| Lần chạy chưa được ghi | 404 "Không tìm thấy lần chạy thử" |

- Video kiểm như lúc ghi kết quả: MP4, WebM hoặc QuickTime, tối đa 200 MB, do chính người gọi tải lên, đã có trên kho.
- Chỉ video thay đổi. Thời gian chạy và ghi chú giữ nguyên.

### 1.3. Tạo lớp và lỗi `targetTimeMs: null`: đã làm, sửa thêm hai chỗ

- `POST /classes`:
  - Các buổi trong `sessions[]` trùng giờ nhau thì trả 409 "Trùng giờ với buổi tập lúc … của lớp", và không lưu gì.
  - `targetTimeMs: null` được hiểu là không có thời gian mục tiêu, không còn lỗi 500.
  - `notes` của mỗi buổi tối đa 1.000 ký tự (400 "Ghi chú tối đa 1000 ký tự").
- `POST /training-sessions/:id/time-trial` cũng bị lỗi `null` thành 500 như trên. Đã sửa giống `POST /classes`.
- **Thêm lẻ một buổi** giờ làm giống tạo lớp: loại buổi lấy theo môn, buổi chạy thử có cấu hình ngay. Đây là thay đổi API, xem Phần 1 dòng 1 và 2.
  - Lý do: trước đây thêm buổi chạy thử phải gọi hai API, dễ quên bước thứ hai rồi công bố bị 409.
  - Ngoài ra trước đây có thể gửi môn chạy thử kèm `sessionType: REGULAR`.
- Lưu lớp nhanh hơn: lớp 300 buổi trước cần 331 câu ghi xuống DB, giờ còn 5. Response không đổi.

### 1.4. Chuỗi hiển thị còn tiếng Anh: đã làm

- Lý do hủy mặc định:
  - Rời lớp: "Ngựa đã rời lớp".
  - Hủy lớp: "Lớp bị hủy: {lý do}".
  - Dữ liệu cũ đã lưu trong DB vẫn giữ câu cũ.
- Tên vai trò thống nhất là **"Huấn luyện viên trưởng"** ở mọi câu lỗi, không còn "HLV trưởng".

### 1.5. Tài liệu lệch code: đã sửa

- `docs/flow2-training.md`:
  - Bổ sung đủ các endpoint chạy thử, đánh giá, ghi danh, danh sách lượt, hủy buổi.
  - Bổ sung các luật mới của đợt này.
- `docs/openapi.contracts.json` và `docs/api-catalog.md` đã sinh lại. Các POST của lượt tập, công bố một buổi và hủy buổi giờ ghi 201, đúng với thực tế. Mã trả về thật **không đổi**.

### 1.6. Rủi ro: đã xử lý cả hai

- **Giới hạn body nâng lên 1 MB.** Đủ cho tối đa 500 buổi một lớp.
  - Vượt giới hạn trả **413** "Dữ liệu gửi lên vượt quá dung lượng cho phép".
  - Trước đây trường hợp này trả 500.
- **Link tải lên ký sẵn:**
  - Đã bỏ checksum CRC32 của body rỗng. Lỗi này MinIO bỏ qua, nhưng AWS S3 thật sẽ từ chối mọi file.
  - Link có ký thêm `Content-Type`, nên gửi sai định dạng sẽ bị chặn ngay lúc tải (xem Phần 1 dòng 4).

---

## 3. Để sau demo

Không đổi so với đợt 1. Các mục B1.7, B1.13, B2.1, B2.11, B3.2–B3.6, B4.4–B4.11, B5.2–B5.6 vẫn để sau demo. FE cứ giữ cách tự xử lý như bảng trong file góp ý.
