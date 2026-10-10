# Phản hồi góp ý Backend của FE

> Cập nhật 09/10/2026. Trả lời file "Góp ý Backend từ phía FE" (09/10/2026). Code nằm ở nhánh `truong-fe-feedback`, chưa merge vào `truong`. Mã mục (A1, B1.1...) giữ đúng như file góp ý.

Đọc nhanh:

- **Phần 1** liệt kê những chỗ FE phải sửa theo, vì API hoặc hành vi đã đổi.
- **Phần 2** là từng mục nhóm A: BE đã làm gì, và chỗ nào làm khác đề xuất của FE.
- **Phần 3** là nhóm B: đã làm, để sau, hoặc không làm.
- **Phần 4** là luật nghiệp vụ mới chốt hoặc đổi trong đợt này.

Đã kiểm: build, unit test (1.280), integration test trên Postgres và Mongo thật (250). Nhóm A còn được chạy thử qua HTTP trên app thật: 12/12 mục đạt. Nhóm B và lỗi rời lớp chưa chạy thử trên app thật.

---

## 1. FE cần sửa theo

| # | Việc | Mục |
|---|---|---|
| 1 | Bỏ bảng dịch `TRAINING_MESSAGES`. BE đã đổi cả 47 câu ở Phụ lục cùng các câu ở A11, nên bảng dịch không còn khớp câu nào | A11, B3.1 |
| 2 | Giáo án gửi `phases` thay cho `subjects`. Xem trước lịch bỏ `weekdays`. Body cũ trả 400 | A1 |
| 3 | Công bố buổi có thể bỏ qua một số ngựa. Đọc `skippedHorses` trong response để báo cho HLV | A5 |
| 4 | Ẩn nút Bắt đầu, Hoàn thành, Ghi thời gian chạy thử và thẻ nhịp tim với Groom | A3 |
| 5 | Video chạy thử là file tải lên MinIO, không phải link dán. Ô video đặt ở sheet ghi thời gian chạy thử, không phải sheet đánh giá | A7 |
| 6 | Đổi mật khẩu sai trả 400 gắn ô `currentPassword`. Không còn trả 401 | A12 |
| 7 | Ô nhập số chip, giống, màu lông thêm kiểm như mục 4.3 để báo lỗi ngay ở ô | B4.1 |
| 8 | Bỏ giới hạn "tối đa 9 ô mỗi khu" nếu sơ đồ chuồng vẽ được khu nhiều ô hơn. BE không có luật này | B4.2 |
| 9 | Màn "Dắt ngựa tập" và lịch tập: lượt có thể tự đổi giữa "Chờ điểm danh" và "Hủy do khóa" khi bác sĩ khóa hoặc gỡ khóa. Tải lại danh sách thay vì giữ trạng thái cũ | A2 |
| 10 | Buổi chưa tới giờ không tự hủy nữa, kể cả khi không còn ngựa nào tập được. Đừng coi "Đã công bố mà 0 ngựa" là lỗi | A2 |

---

## 2. Nhóm A

### A1. Giáo án mỗi tuần nhiều môn: đã làm, khác dạng body FE gợi ý

- **Body dạng lồng**, thay cho dạng phẳng có trường `phase`:

  ```json
  {
    "name": "Tăng tốc 4 tuần",
    "phases": [
      { "weeks": 2, "subjects": [
        { "subjectId": "<kiệu dài>", "weekdays": [1, 3] },
        { "subjectId": "<nước rút ngắn>", "weekdays": [5] }
      ] },
      { "weeks": 2, "subjects": [
        { "subjectId": "<kiệu nhẹ>", "weekdays": [1] },
        { "subjectId": "<chạy thử 1.200 m>", "weekdays": [4] }
      ] }
    ]
  }
  ```

  Mỗi giai đoạn chỉ ghi số tuần một lần, nên không thể xảy ra lỗi hai dòng cùng giai đoạn mà khác số tuần.
- **Response** có `phases: [{ position, startWeek, weeks, subjects: [{ subject, weekdays }] }]` và `totalWeeks`. Không còn `subjects` dạng phẳng.
- **Luật kiểm:**
  - Trong một giai đoạn, một thứ chỉ thuộc một môn. Sai trả 400 "Giai đoạn 1: Thứ Tư bị chọn cho hơn một môn", gắn ô `phases.0.subjects.1.weekdays`.
  - Một môn không lặp trong cùng giai đoạn.
  - Tổng số tuần không quá 104.
- **Xem trước lịch:** `POST /classes/schedule-preview` nhận `{ planId, startDate, startTime, durationMinutes }`, không còn `weekdays`. Ngày nào không thuộc môn nào thì không sinh buổi. HLV vẫn sửa tay từng buổi ở bước xem trước như cũ.
- **Dữ liệu cũ:** migration xóa sạch giáo án, lớp, buổi, ghi danh, lượt tập hiện có. Danh mục môn học được giữ.

### A2. Lượt bị khóa cứng sau khi ngựa khỏi bệnh: đã làm, rộng hơn đề xuất

FE chỉ đề xuất mở lại lượt. BE làm cả hai chiều:

- **Chấm lại ngay** khi bác sĩ đặt khóa, gỡ khóa, hoặc đổi sức khỏe (xấu đi hay tốt lên).
  - Phạm vi: lượt Chờ điểm danh, Hủy do khóa, Không đủ điều kiện của ngựa đó, ở buổi đã công bố mà chưa tới giờ.
  - Ổn hết thì về Chờ điểm danh. Còn lý do thì giữ, ví dụ gỡ khóa nhưng vẫn chấn thương.
  - Không đụng lượt đã điểm danh, đang tập, đã kết thúc, hay buổi đã tới giờ.
- **Buổi chưa tới giờ không bao giờ tự đóng.** Trước đây chỉ cần khóa con ngựa duy nhất của lớp là mọi buổi tương lai tự hủy, gỡ khóa cũng không cứu được. Giờ buổi giữ "Đã công bố" và chờ tới giờ.
- **Buổi đã tới giờ mà không còn lượt mở** thì hệ thống tự đóng trong vòng 1 phút. Có lượt đã diễn ra thì thành Hoàn thành, không có thì thành Hủy với lý do "Không còn ngựa tham gia".
- Ví dụ: lớp 1 ngựa, bác sĩ khóa 3 ngày. Các lượt tương lai thành Hủy do khóa nhưng buổi vẫn còn. Gỡ khóa thì lượt về Chờ điểm danh, ngựa tập tiếp bình thường.

### A3. Groom chỉ điểm danh, báo vắng, báo sẵn sàng: đã làm đúng đề xuất

- Groom gọi `start`, `complete`, `POST trial-results`, `GET metrics` thì nhận 403.
- `performance-summary` chỉ cho Quản lý CLB, bác sĩ, HLV trưởng, chủ ngựa.
- Groom vẫn xem được kết quả chạy thử và đánh giá. FE không nêu phần xem nên BE giữ nguyên.

### A4. Đổi HLV phụ trách khu: đã làm, điều kiện hẹp hơn

- Chặn khi HLV cũ còn lớp **Đang chạy** có ghi danh đang học của ngựa thuộc khu đó. Lớp nháp không tính, vì lớp nháp chưa ghi danh được ngựa.
- 409, câu lỗi nêu mã lớp: "Huấn luyện viên trưởng hiện tại còn lớp KD-0810, KD-0815 đang có ngựa của khu này. Cho các ngựa rời lớp hoặc hoàn thành lớp trước khi đổi Huấn luyện viên trưởng, hoặc dùng Bàn giao nếu Huấn luyện viên nghỉ."
- **Lưu ý:** API rời lớp (`PATCH /enrollments/:id/leave`) trước đây luôn trả 500, FE chưa gặp. Đã sửa (xem Phần 3).

### A5. Ngựa bị xếp trùng giờ: đã làm, công bố xử lý khác đề xuất

- **Thêm hoặc sửa giờ buổi** trùng với buổi khác của cùng lớp: 409 "Trùng giờ với buổi tập lúc 07:00 ngày 12/10/2026 của lớp".
- **Ghi danh** ngựa đã có lượt trùng giờ ở lớp khác: 409 "Ngựa Giả Nhân đã có buổi tập trùng giờ ở lớp KD-0810".
- **Công bố** (một buổi hoặc nhiều buổi) **không báo lỗi**. Ngựa trùng giờ được bỏ qua, ngựa khác vẫn có lượt. Mỗi buổi trong response kèm:

  ```json
  "skippedHorses": [{ "horseId": "…", "horseName": "Giả Nhân", "conflictClassCode": "KD-0810", "conflictStartAt": "2026-10-12T00:00:00.000Z" }]
  ```

  Lý do: luật cũ là công bố nhiều buổi mà một buổi lỗi thì không buổi nào được công bố. Nếu trả 409 thì một ngựa trùng giờ sẽ chặn cả tuần của mọi ngựa khác.
- Tính trùng theo khoảng `[bắt đầu, kết thúc)`, chạm mép không tính. Lượt Hủy do khóa và Không đủ điều kiện vẫn tính là giữ chỗ, vì chúng có thể được mở lại (A2).
- **Câu FE ghi "HLV không đọc được lịch lớp của HLV khác" không đúng.** Ngựa chỉ ghi danh được vào lớp của HLV phụ trách khu của ngựa. Vì vậy trùng giờ chỉ xảy ra giữa các lớp của cùng một HLV, và HLV đó xem được hết.

### A6. Lượt kẹt ở "Có mặt" hoặc "Sẵn sàng": đã làm

- Báo vắng nhận cả lượt Có mặt và Sẵn sàng.
- Response trả 201 (POST mặc định).
- `checkedInAt` vẫn giữ giá trị cũ khi báo vắng một lượt đã điểm danh.

### A7. Video chạy thử: đã làm, khác đề xuất

- Đề tài ghi "video các buổi đua thử", nên video gắn vào **kết quả chạy thử**, không gắn vào đánh giá sau buổi.
- Video là **file tải lên MinIO**, không phải link YouTube hay Drive. Lý do: link Drive riêng tư thì chủ ngựa không mở được, và BE không kiểm được nội dung link.
- **Luồng tải video:**
  1. HLV gọi `POST /media/upload-requests` với `purpose = TRIAL_VIDEO`. Định dạng MP4, WebM hoặc QuickTime, tối đa 200 MB. Chỉ HLV trưởng được tải.
  2. PUT file lên URL được cấp.
  3. Gọi `POST /media/:id/complete`.
  4. Gửi `videoMediaId` khi ghi kết quả chạy thử. Video phải do chính người ghi tải lên.
- `GET /session-participants/:id/trial-results` và `GET /horses/:id/training/sessions` trả thêm `videoUrl`, là link xem có hạn (null nếu không có video). Chủ ngựa xem được qua API thứ hai.
- Đã thử trên app thật: tải lên, ghi kết quả, chủ ngựa tải lại về đúng file.

### A8. Sửa buổi không xóa được địa điểm, mặt sân, ghi chú: đã làm đúng đề xuất

Gửi `null` thì xóa giá trị, không gửi field thì giữ nguyên.

### A9. Ghi danh và rời lớp so ngày theo UTC: đã làm

So theo ngày lịch Việt Nam. Ghi danh lúc 00:30 giờ VN ngày khai giảng đã được nhận.

### A10. Tên ngựa, tên Groom: đã làm cho các API danh sách

- `GET /training-sessions/:id/participants` thêm `horseName`, `horsePhotoUrl`, `assignedGroomName`.
- `GET /classes/:id/enrollments` thêm `horseName`, `horsePhotoUrl`.
- **Lưu ý:** DTO ghi danh vốn không có Groom (file góp ý ghi nhầm), nên chỉ thêm tên và ảnh ngựa.
- Các API ghi (điểm danh, bắt đầu...) trả response như cũ. FE tải lại danh sách sau khi ghi để có tên.
- Ngựa hoặc Groom đã xóa vẫn hiện tên. `horsePhotoUrl` là link có hạn, null nếu ngựa không có ảnh.

### A11. Câu lỗi người dùng thấy nguyên văn: đã làm cả A11 và 47 câu Phụ lục

- Đổi 82 câu: tiếng Việt có dấu, không lộ mã trạng thái.
- Thuật ngữ thống nhất:
  - participant → lượt tập
  - session → buổi tập
  - class → lớp
  - Head Trainer → HLV trưởng
  - Time Trial → chạy thử
- Câu số 47 ("Không tìm thấy video media") không còn trong code.
- **Chưa đổi:** câu lỗi validate mặc định của class-validator vẫn là tiếng Anh, ví dụ `message: "Validation failed"`, "property subjects should not exist". Mục này thuộc B3.2, để sau.

### A12. Đổi mật khẩu sai: đã làm đúng đề xuất

400, `errors[0] = { field: "currentPassword", message: "Mật khẩu hiện tại không đúng" }`.

### A13. Kiểm dữ liệu DB demo: BE đã chuẩn bị, chưa chạy

- File `scripts/check-demo-data.sql` gồm 4 câu: ngựa dưới 1 tuổi, ngựa quá 40 tuổi, cha mẹ lớn hơn con chưa tới 2 năm, ô chuồng `FOALING`. Trên DB dev cả 4 câu ra 0 dòng.
- **Chú ý:** chạy `npm run db:migrate` trên DB demo sẽ xóa dữ liệu huấn luyện (A1).

---

## 3. Nhóm B

### Đã làm

| Mã | Việc |
|---|---|
| B1.1 | Ngựa rời lớp rồi ghi danh lại: lượt đã hủy ở các buổi đã công bố được dùng lại, ngựa có lượt bình thường |
| B1.2 | Đổi khu của ngựa đang tập (lượt Đang tập ở lớp sẽ bị rút): 409 "Ngựa đang tập, chờ hoàn thành lượt tập rồi mới đổi khu". Đổi sang khu cùng HLV thì vẫn cho qua |
| B1.3 | Buổi 0 ngựa không còn treo "Đã công bố" mãi: hệ thống tự đóng khi tới giờ (xem A2) |
| B1.8 | Màn giám sát lấy 7.200 điểm đo mới nhất, không lấy cũ nhất |
| B1.10 | Giới hạn độ dài: mã lớp 32 ký tự; tên lớp, tên buổi, địa điểm 160; mặt sân 80. Áp cả khi tạo lớp kèm buổi. Quá dài trả 400 thay vì 500 |
| B3.1 | 47 câu lỗi (xem A11) |
| B4.1 | Số chip, giống, màu lông (luật ở mục 4.3) |
| B5.1 | Dashboard y tế đếm đủ 4 ô sức khỏe khi lọc theo sức khỏe (luật mới ở mục 4.2) |
| (mới) | Xem trước đổi khu (`GET /horses/:id/barn-preview`) báo luôn ca ngựa đang tập: `allowed: false`, `blockedReason` là câu 409 của B1.2 |
| (mới) | API rời lớp `PATCH /enrollments/:id/leave` trước đây luôn trả 500. Đã sửa |

### Để sau demo

B1.7, B1.13, B2.1 (`GET /session-participants/:id`), B2.11 (báo cáo `/reports`), B3.2 đến B3.6, B4.4 đến B4.9, B4.11, B5.2 đến B5.6.

### Không làm

| Mã | Lý do |
|---|---|
| B2 (trừ B2.1, B2.11) | API gộp chỉ để giảm số request. FE đang chạy ổn ở quy mô demo |
| B4.2 | Không có luật nghiệp vụ "tối đa 9 ô". Đây là giới hạn của lưới 3×3 ở FE (`MAX_STALLS_PER_BARN`). Khu chỉ bị giới hạn bởi sức chứa tự khai |
| B4.3 | BE đã đúng: gửi lại đúng trạng thái vòng đời hiện tại thì trả hồ sơ, không ghi gì |
| B1.4 | Có chặn điểm danh theo giờ buổi hay không là quyết định nghiệp vụ. Chặn thì không demo được buổi chưa tới giờ |
| B1.5, B1.6, B1.9, B1.11, B1.12, B1.14, B1.15, B1.16, B3.7, B5.7 | Hiếm gặp, chỉ ảnh hưởng dev, hoặc FE đã có đường vòng |

---

## 4. Luật nghiệp vụ mới chốt hoặc đổi

### 4.1 Huấn luyện

1. Giáo án chia giai đoạn. Mỗi giai đoạn có số tuần và nhiều môn, mỗi môn gắn thứ cố định. Lớp không chọn thứ riêng (A1).
2. Lượt tập được chấm lại ngay khi đặt khóa, gỡ khóa, hoặc đổi sức khỏe. Buổi chưa tới giờ không tự đóng (A2).
3. Một ngựa học nhiều lớp nhưng lịch không có hai buổi trùng giờ, kể cả buổi nháp. Ghi danh và thêm/sửa giờ buổi thì chặn 409, công bố thì bỏ qua ngựa trùng (A5).
4. Groom chỉ điểm danh, báo vắng, báo sẵn sàng. Bắt đầu, hoàn thành, ghi chạy thử và xem nhịp tim là việc của HLV trưởng (A3).
5. Đổi HLV của khu bị chặn khi HLV cũ còn lớp đang chạy có ngựa của khu (A4).
6. Đổi khu của ngựa bị chặn khi ngựa đang tập ở lớp sẽ bị rút (B1.2).

### 4.2 Y tế: đổi luật Q9

- **Trước đây:** lọc dashboard theo sức khỏe thì 4 ô đếm cũng bị lọc. Ví dụ lọc "Chấn thương" thì ô Đủ điều kiện ra 0, dù đàn có 12 con.
- **Bây giờ:** 4 ô đếm chỉ lọc theo khu. Lọc sức khỏe chỉ thu hẹp danh sách ngựa và ba khối còn lại (lịch khám, bệnh án đang mở, yêu cầu khám). Docs Flow 3 đã sửa theo.

### 4.3 Hồ sơ ngựa: luật nhập liệu

Hai đầu chuỗi được bỏ khoảng trắng trước khi kiểm. Ô giống, màu lông để trống thì lưu null, không báo lỗi.

| Field | Luật | Được | Bị chặn |
|---|---|---|---|
| Tên ngựa | Bắt buộc, 1 đến 160 ký tự. Giữ như cũ, có số hay dấu nháy vẫn được | Gió Đông 2, O'Brien | |
| Giống | Tùy chọn, tối đa 80 ký tự, chỉ chữ cái (có dấu). Các từ nối bằng một khoảng trắng, gạch nối hoặc dấu nháy | Anglo-Arabian, Akhal-Teke, Quarter Horse | Bay2, Bay-- |
| Màu lông | Như giống, tối đa 40 ký tự | Dark Bay, Hạt dẻ | Nâu  sẫm (hai dấu cách) |
| Số chip | Tùy chọn, đúng 15 chữ số theo chuẩn ISO 11784, không trùng | 704123456789012 | 70412345, VN-123 |

Lưu ý: file góp ý ghi các luật này "chỉ kiểm ở FE", nhưng code FE hiện tại chưa kiểm. Luật "chỉ chữ cái" nguyên văn còn chặn cả 2 giống có trong danh mục của FE (Anglo-Arabian, Akhal-Teke), nên BE nới thêm gạch nối và dấu nháy.
