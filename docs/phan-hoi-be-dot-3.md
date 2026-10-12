# BE phản hồi góp ý FE đợt 3

> Cập nhật: 12/10/2026. Code ở nhánh `truong` của `horse-racing-ne`, commit `19f8a07` → `0c09389`.

Đối chiếu với file `gop-y-be.md` (đợt 3). **Mục 1 xong hết. Mục 2 xong hết.** Có một số thay đổi phá vỡ, FE cần sửa ở phần A.

---

## A. FE cần sửa (thay đổi phá vỡ)

### A1. Số trả về dạng number, không còn là chuỗi (B3.4)

Các trường dưới đây trước trả chuỗi (`"35.00"`), giờ trả số JSON (`35`). Số 0 ở cuối phần thập phân không còn (`"512.50"` → `512.5`), FE tự định dạng khi hiển thị. `null` vẫn là `null`.

| API / màn | Trường |
|---|---|
| Chạy thử (time trial) | `distanceM`, `targetTimeMs`, `elapsedMs` (cả trong tab Huấn luyện của ngựa) |
| Chỉ số cơ thể | `value` (danh sách, mới nhất, kết quả tạo) |
| Kết quả đua | `timeSeconds` |
| Vật tư | `quantityOnHand`, `reorderThreshold`, `delta`, `balanceAfter`, `quantity` của đề xuất |
| Khẩu phần | `quantity` của từng món (cả màn Hôm nay của Groom) |
| Hiệu suất | `speedMps`, `avgSpeedMps`, `maxSpeedMps` (REST và socket `performance.metrics`) |

Thêm: thời gian mục tiêu và thời gian chạy thử chỉ nhận tối đa **3.600.000 ms (60 phút)**, quá thì 400. Áp cho tạo/sửa chạy thử, ghi kết quả, thêm buổi tập, tạo lớp kèm lịch, tạo/sửa môn học.

### A2. Khung giờ điểm danh và bắt đầu buổi tập (B1.13 kéo theo)

Trước đây điểm danh, bắt đầu lúc nào cũng được. Giờ (ví dụ buổi 15:00–16:00):

| Thao tác | Được làm | Ngoài khung |
|---|---|---|
| Điểm danh (`check-in`), báo vắng (`absent`) | 14:30 → 16:00 | 409 |
| Sẵn sàng (`ready`), bắt đầu (`start`) | 14:45 → 16:00 | 409 |
| Hoàn thành (`complete`) | không giới hạn | |

Câu 409: `Chưa tới giờ, mở lúc 14:30 ngày 12/10/2026` hoặc `Buổi tập đã hết giờ lúc 16:00 ngày 12/10/2026`. **FE nên ẩn hoặc khóa nút ngoài khung giờ.**

Buổi hết giờ mà lượt chưa tập: trong vòng 1 phút hệ thống tự chuyển Chờ điểm danh → Vắng (lý do `Hết giờ, chưa điểm danh`), Có mặt/Sẵn sàng → Bỏ qua (`SKIPPED`). Lượt Đang tập giữ nguyên.

Con số 30/15 phút đang chờ BA xác nhận, có thể đổi.

### A3. Head Trainer chỉ thấy khu mình (B3.6)

Áp cho Head Trainer không kiêm Club Manager hoặc bác sĩ:

- `GET /barns`: chỉ trả khu mình phụ trách.
- `GET /medical/dashboard`: không truyền `barnId` thì lấy mọi khu mình phụ trách; truyền khu khác thì **403** `Khu không thuộc bạn phụ trách`.

Các màn xem khác (lịch khám, hàng đợi yêu cầu khám, danh sách ngựa…) vẫn toàn CLB, đang chờ BA chốt.

### A4. Các thay đổi nhỏ

1. Loại ô `FOALING` đã bỏ: gửi `type: "FOALING"` trả 400 (B4.11).
2. `PATCH /supplies/requests/:id` gửi `quantity: null` hoặc `note: null` trả 400. Muốn xóa ghi chú thì gửi `""` (1.5).
3. Ô ngày `fromDate`, `toDate` (việc riêng) và `from`, `to` (checklist) chỉ nhận `YYYY-MM-DD`, sai dạng trả 400 thay vì 500 (1.4).
4. Chuỗi chỉ có khoảng trắng trả 400 ở: mô tả và kết quả xử lý sự cố, tên loại việc, tên/đơn vị vật tư, lý do từ chối đề xuất, tên khu, mã ô (1.3).
5. `POST /auth/refresh` với refresh token hết hạn hoặc đã thu hồi trả **401** `Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại` (trước là 502). FE chuyển về màn đăng nhập khi gặp 401 ở đây.

---

## B. Trường mới FE dùng được

| API | Trường | Ý nghĩa |
|---|---|---|
| Yêu cầu khám (mọi API) | `incidentId: string \| null` | Sự cố sinh ra yêu cầu này. FE bỏ cách gọi `GET /incidents?horseId=` rồi khớp tay (1.1) |
| Sự cố | `resolvedBySystem: boolean` | `true` khi hệ thống tự đóng (ngựa chuyển nhượng hoặc mất), lúc đó `resolver` là `null` (1.2) |
| Xem trước đổi vòng đời | `incidentsClosed: number` | Số sự cố đang mở sẽ tự đóng; câu `summary` cũng nhắc (1.2) |
| Nhận số đo (`POST /session-participants/:id/metrics`, `/batch`) | `skippedInvalid: number` | Số điểm đo bị bỏ vì tốc độ > 25 m/s hoặc thời điểm đo ngoài lượt tập (B1.7) |
| Mọi lỗi 409 trùng dữ liệu | `errors: [{ field, message }]` | Gắn lỗi lên ô (B3.3), xem phần C |

---

## C. Định dạng lỗi

**Lỗi 409 trùng dữ liệu có thêm `errors`** (trước chỉ 400 mới có). FE gắn lỗi lên ô theo `field`, không cần so câu chữ:

```json
{
  "code": 409,
  "message": "Microchip đã được dùng cho ngựa khác",
  "errors": [{ "field": "microchipId", "message": "Microchip đã được dùng cho ngựa khác" }]
}
```

| Trùng | `field` |
|---|---|
| Số chip ngựa | `microchipId` |
| Tên khu chuồng | `name` |
| Mã ô chuồng | `code` |
| Tên loại việc, tên môn học, tên vật tư | `name` |
| Mã lớp | `code` |
| Email tài khoản (DB hoặc Keycloak) | `email` |
| Ảnh đã gắn cho sự cố khác | `photoMediaId` |

Lỗi 409 khác (vd dữ liệu đã thay đổi, còn bệnh án mở) vẫn như cũ, không có `errors`.

**Câu lỗi tiếng Việt** (B3.2). HTTP code không đổi, chỉ đổi câu:

- Lỗi validate mặc định: `name must be a string` → `name phải là chuỗi`, `must not be longer than 80 characters` → `tối đa 80 ký tự`, ô thừa → `Không nhận ô extra`… Tên ô vẫn tiếng Anh, `errors[].field` không đổi.
- `message` tổng của 400 validate: `Validation failed` → `Dữ liệu không hợp lệ`.
- 500: `Internal server error` → `Lỗi hệ thống, vui lòng thử lại sau`.
- id trên đường dẫn sai UUID: `Mã định danh trên đường dẫn phải là UUID`.
- Câu Keycloak: `Máy chủ xác thực báo lỗi (mã N)`, `Phiên đăng nhập không hợp lệ`, `Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại`.

FE đang so câu tiếng Anh ở đâu thì đổi sang `code` + `errors[].field`.

Riêng 429: BE không có giới hạn tần suất. 429 FE gặp đến từ proxy hoặc Keycloak, BE không sửa được câu.

---

## D. Hành vi đổi, FE bỏ được cách tự xử lý

| Mục | Trước | Giờ | FE |
|---|---|---|---|
| 1.2 | Sự cố mở của ngựa chuyển nhượng/mất không ai đóng được | Tự đóng cùng lúc đổi vòng đời, kết quả `Ngựa đã chuyển nhượng` / `Ngựa đã mất` | Bỏ xử lý riêng |
| 1.6 | Checklist ngày cũ chỉ đóng nhờ tác vụ 00:05 | Thêm chạy bù khi BE khởi động | Có thể bỏ việc tự hiện "Không hoàn thành" |
| 1.7 | `/grooms/me/today` có cả lượt hủy, vắng, bỏ qua | Chỉ còn lượt Chờ điểm danh, Có mặt, Sẵn sàng, Đang tập, Hoàn thành | Bỏ lọc |
| 1.8 | Đổi Groom: checklist hôm nay đã xong vẫn thuộc Groom cũ | Chuyển cả checklist hôm nay (kể cả đã xong) cho Groom mới; việc đã tick vẫn giữ tên người tick (`doer`) | Không cần xử lý |
| B1.7 | Nhận số đo vô lý (tốc độ 1e6, năm 2020) | Điểm đo tốc độ > 25 m/s hoặc ngoài khoảng [lượt bắt đầu − 5s, hiện tại + 5s] bị bỏ, các điểm khác vẫn lưu | Script giả lập gửi `recordedAt` là giờ hiện tại |
| B1.13 | Tab Sắp tới/Lịch sử chia theo giờ | `upcoming` = lượt còn mở (bất kể giờ) + lượt Không đủ điều kiện của buổi chưa tới giờ; `history` = lượt đã kết thúc, kể cả chạy xong trước giờ lịch | Bỏ tự lọc |
| 1.9, B4.11 | Tài liệu lệch | Đã sửa mô tả `GET /horses/:horseId/checklists`, Swagger `INCIDENT_PHOTO`, chuyển chủ (bỏ "ngày hiệu lực"), `NOT_APPLICABLE` (thêm "đã mất") | |

---

## E. Còn chờ BA

1. Phạm vi xem của Head Trainer: chỉ 2 màn ở A3 hay mọi màn.
2. Con số khung giờ (30/15 phút) và việc tự chuyển lượt khi hết giờ ở A2.

BE sẽ báo lại nếu BA chốt khác.
