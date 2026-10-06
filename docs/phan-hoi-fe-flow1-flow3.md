# Phản hồi BE cho yêu cầu sau review Flow 1 và Flow 3

Cập nhật 06/10/2026. Trả lời file `yeu-cau-be.md` (FE viết khi đối chiếu BE commit `6522bec`).

Từ commit đó tới nay BE đã đổi khá nhiều: thông báo chuyển sang MongoDB, event đi qua outbox, đổi tên vài trường. Chỗ nào yêu cầu cũ còn hợp lý thì BE làm đúng như file. Chỗ nào đụng phần BE mới thì BE giữ thiết kế mới, FE sửa theo. Những chỗ FE cần sửa được đánh dấu **[FE sửa]**.

Tài liệu API đầy đủ ở `docs/api-catalog.md` và `docs/openapi.contracts.json`.

---

## Tóm tắt

| Mã | Tình trạng | FE cần làm |
|---|---|---|
| Body lỗi 400 | Thêm `errors` theo từng ô | Nên đọc `errors` thay cho dò chữ (mục 1) |
| BE-1 | Đã làm đúng file | Không |
| BE-2 | Đã làm đúng file | Không |
| BE-3 | Đã làm, có thêm vài chi tiết | Xử lý `DECEASED` ở mọi chỗ hiện vòng đời (mục 4) |
| BE-4 | Đã làm đủ 3 phần | Màn chuyển nhượng, lịch sử sở hữu, `costHidden` (mục 5) |
| BE-5 | **Khác file**: giữ thiết kế thông báo mới của BE | **[FE sửa]** đọc `category`, `priority`, `resource` (mục 6) |
| BE-6 | Đã làm, đổi luôn tên vai trò ở các câu lỗi khác | **[FE sửa]** chỗ dò chữ "head trainer" (mục 7) |
| BE-7 | Đã chạy trên DB dev của BE | Chạy lại trên DB demo (mục 8) |

---

## 1. Body lỗi

Mọi mã lỗi vẫn có đủ các key như cũ: `{ code, message, details, correlationId, timestamp }`. **Riêng lỗi 400 có thêm key `errors`**, là mảng `{ field, message }`.

- `field` là tên ô trong request body. Ô lồng nhau viết dạng `items.0.code`.
- Lỗi do DTO sai: `details` vẫn là mảng chuỗi như cũ, `errors` có từng ô.
- Lỗi do luật nghiệp vụ có gắn ô: `details: null`, `errors` có một phần tử.
- Lỗi 400 không gắn ô nào: `errors: []`.
- Các mã 401, 403, 404, 409, 500 không có key `errors`.

```json
{
  "code": 400,
  "message": "Ngựa mẹ phải lớn hơn ngựa con ít nhất 2 tuổi",
  "details": null,
  "errors": [{ "field": "damId", "message": "Ngựa mẹ phải lớn hơn ngựa con ít nhất 2 tuổi" }],
  "correlationId": "9f1c...",
  "timestamp": "2026-10-06T08:00:00.000Z"
}
```

Đề xuất FE: có `errors` thì gắn lỗi vào ô theo `field`, không có thì làm như cũ. Các câu lỗi mới đều giữ đúng chữ khóa như file FE dặn, nên cách dò chữ hiện tại vẫn chạy được.

Các lỗi mới có `field`:

| Lỗi | `field` |
|---|---|
| Ngày sinh ngoài khoảng 1 đến 40 tuổi | `dateOfBirth` |
| Cha hoặc mẹ chưa lớn hơn con 2 năm, cha/mẹ sai giới tính | `sireId` / `damId` |
| Đổi ngày sinh của ngựa đang làm cha mẹ | `dateOfBirth` |
| Ngày mất (thiếu, ở tương lai, trước ngày sinh, gửi kèm trạng thái khác) | `dateOfDeath` |
| PATCH gửi `ownerId: null` | `ownerId` |
| Chuyển nhượng: chủ mới trùng chủ cũ | `newOwnerId` |
| Chuyển nhượng: ngày hiệu lực sai | `effectiveDate` |

---

## 2. BE-1. Giới hạn ngày sinh

Làm đúng file: không muộn hơn ngày này năm trước, không sớm hơn ngày này 40 năm trước, tính theo lịch CLB. Hôm nay là 29/02 thì mốc dưới là 28/02 năm trước. Câu lỗi giữ đúng như file.

Một điểm đã sửa: trước đây PATCH cứ gửi `dateOfBirth` là kiểm, kể cả khi giá trị không đổi. Giờ **chỉ kiểm khi ngày sinh thực sự đổi**, nên hồ sơ cũ gửi lại đúng ngày sinh cũ vẫn lưu được.

## 3. BE-2. Cha mẹ lớn hơn con ít nhất 2 năm

Làm đúng file, áp cho cả hai chiều. Câu lỗi giữ đúng chữ, hai câu về cha mẹ không chứa chữ "ngày sinh".

---

## 4. BE-3. Trạng thái "Đã mất"

Làm đúng file: bảng chuyển trạng thái, chặn khi còn bệnh án mở, các bước dọn dẹp, hồ sơ chỉ đọc, ngựa mất vẫn chọn làm cha mẹ được, số chip vẫn giữ chỗ. Thêm vài chi tiết như sau.

**API**
- `PATCH /horses/:horseId/lifecycle-status` có thêm `dateOfDeath`:
  - Bắt buộc khi `lifecycleStatus = DECEASED`.
  - Gửi kèm trạng thái khác thì trả 400 `Chỉ nhập ngày mất khi ghi nhận ngựa mất`.
- Ngựa đã mất mà đổi sang trạng thái khác thì trả 409 `Ngựa đã mất, hồ sơ chỉ được xem`. Preview cũng trả câu này trong `blockedReason`.
- Hồ sơ ngựa và danh sách ngựa có thêm `dateOfDeath`, null nếu chưa mất.
- `GET /horses?lifecycleStatus=DECEASED` lọc được ngựa đã mất.

**Giá trị enum mới (FE cần thêm nhãn)**
- `lifecycleStatus`: `DECEASED`
- `EligibilityReason`: `LIFECYCLE_DECEASED`
- Preview xóa hồ sơ (`GET .../deletion-preview`) có thêm cờ `deceased`, đứng riêng với cờ `transferred` đang có.

**Câu lỗi 409 khi thao tác trên ngựa đã mất**

| Thao tác | Câu lỗi |
|---|---|
| Sửa hồ sơ, đổi khu, ghi chỉ số, y tế, xóa hồ sơ | `Ngựa đã mất, hồ sơ chỉ được xem` |
| Xếp ô | `Ngựa đã mất, không xếp ô chuồng được` |
| Giao Groom | `Ngựa đã mất, không giao groom được` |
| Vào lớp | `Ngựa đã mất, không học lớp` |
| Preview đổi khu | `blockedReason`: `Ngựa đã mất, hồ sơ chỉ đọc` |

**Thông báo:** gửi cho chủ ngựa (nếu còn hoạt động), Huấn luyện viên trưởng của khu cũ và Groom cũ, với category `HORSE_LIFECYCLE` và priority `HIGH`. Groom không nhận thêm thông báo "đã chuyển nhượng".

---

## 5. BE-4. Chuyển nhượng nội bộ và lịch sử sở hữu

Làm đúng file. Bảng `horse_ownerships` mới đã có sẵn dữ liệu chuyển đổi: mỗi ngựa đang có chủ có đúng một giai đoạn mở, bắt đầu từ ngày tạo hồ sơ.

**5.1. API mới**

`POST /horses/:horseId/ownership-transfers` (chỉ Quản lý CLB)

```json
{ "newOwnerId": "uuid", "effectiveDate": "2026-06-01", "reason": "HĐ 12/2026", "version": 3 }
```

- Trả 201 kèm hồ sơ ngựa mới, đã tăng `version`.
- Câu lỗi và mã lỗi đúng bảng trong file.
- Thứ tự kiểm:
  1. sai version
  2. ngựa không còn ở CLB
  3. chưa có chủ
  4. trùng chủ
  5. ngày hiệu lực sai
  6. chủ mới không hợp lệ
  7. còn bệnh án mở

`GET /horses/:horseId/ownerships` (mọi vai trò xem được hồ sơ). Trả về mới nhất lên trên:

```json
[
  {
    "id": "uuid",
    "owner": { "id": "uuid", "fullName": "Nguyễn B" },
    "effectiveDate": "2026-06-01",
    "endDate": null,
    "reason": "HĐ 12/2026",
    "recordedBy": { "id": "uuid", "fullName": "Quản lý A" },
    "recordedAt": "2026-06-02T03:00:00.000Z"
  }
]
```

- `endDate` là ngày hiệu lực của giai đoạn kế tiếp. Giai đoạn kết thúc vì chủ bị bỏ trống thì `endDate` là ngày bị bỏ trống. Giai đoạn hiện tại có `endDate: null`.
- Chủ ngựa chỉ thấy các giai đoạn của chính mình.
- `recordedBy: null` với dữ liệu chuyển đổi.

Hồ sơ chi tiết (`GET /horses/:horseId`) có thêm `ownerSince`: ngày hiệu lực của giai đoạn hiện tại, null nếu chưa có chủ.

**5.2. Đổi API cũ [FE sửa]**

`PATCH /horses/:horseId` với `ownerId`:

| Gửi | Kết quả |
|---|---|
| Không gửi `ownerId` | Không đổi chủ |
| Đúng chủ hiện tại | Không đổi gì |
| Chủ mới, ngựa chưa có chủ | Gán chủ, mở giai đoạn mới với ngày hiệu lực là hôm nay |
| Chủ mới, ngựa đã có chủ khác | 409 `Ngựa đã có chủ sở hữu, đổi chủ bằng chức năng chuyển nhượng nội bộ` |
| `null` | 400 `Không bỏ trống chủ sở hữu được, đổi chủ bằng chức năng chuyển nhượng nội bộ` |

Form sửa hồ sơ của FE không được gửi `ownerId` khi người dùng không đổi chủ, và không được gửi `null`. `POST /horses` vẫn để trống chủ được như cũ.

**5.3. Chi phí y tế theo giai đoạn**
- Bệnh án thuộc về người đang làm chủ lúc bệnh án được **đóng**.
- Báo cáo `GET /medical/cost-report?ownerId=...` lọc theo giai đoạn sở hữu. Ví dụ A/B trong file đã có test: lọc A ra 5 triệu, lọc B ra 3 triệu.
- Chủ ngựa xem bệnh án (danh sách và chi tiết):
  - Bệnh án thuộc giai đoạn của chủ khác có `totalCost: null` và `costHidden: true`.
  - `totalCost` của ngựa chỉ cộng các bệnh án thuộc giai đoạn của người gọi.
- Key mới `costHidden` có mặt cùng lúc với `totalCost`: Quản lý CLB và Bác sĩ luôn nhận `false`, Huấn luyện viên trưởng không có cả hai key, như cũ.
- **[FE sửa]** `totalCost: null` giờ có hai nghĩa: bệnh án chưa đóng, hoặc chi phí bị ẩn. FE xem `costHidden` để hiện "Chi phí thuộc chủ trước".

**5.4. Thông báo** (category `OWNERSHIP`)

| Người nhận | Tiêu đề | `resource` |
|---|---|---|
| Chủ mới | `Bạn đã trở thành chủ sở hữu ngựa {tên}` | HORSE |
| Chủ cũ | `Ngựa {tên} đã chuyển sang chủ khác` | `null` |

Thông báo chỉnh chi phí bệnh án gửi cho chủ của giai đoạn chứa bệnh án. Nếu người đó không còn là chủ hiện tại thì `resource: null`.

---

## 6. BE-5. Thông báo **[FE sửa]**

**Khác file.** Khi file được viết, thông báo còn nằm ở Postgres và có trường `type` (SYSTEM/INFO...). Hiện BE đã chuyển sang MongoDB với thiết kế mới, đã đáp ứng đúng ý của file (không gửi link, gửi loại và đối tượng đích). BE giữ thiết kế này và không thêm trường `event`.

Shape hiện tại, dùng chung cho socket `notification.created` và API `GET /notifications`:

```json
{
  "id": "uuid",
  "category": "MEDICAL_CASE",
  "priority": "NORMAL",
  "title": "Đóng bệnh án ngựa Winx",
  "message": "...",
  "resource": { "type": "MEDICAL_CASE", "id": "uuid bệnh án", "horseId": "uuid ngựa" },
  "readAt": null,
  "createdAt": "2026-10-06T08:00:00.000Z"
}
```

Đổi từ trường trong file FE sang trường thật:

| File FE | Trường thật | Ghi chú |
|---|---|---|
| `type` (mức độ) | `priority` | `NORMAL`, `HIGH`, `URGENT` |
| `event` | `category` | Gộp theo nhóm, xem bảng dưới |
| `target.kind` | `resource.type` | `HORSE`, `MEDICAL_CASE`, `TRAINING_LOCK` |
| `target.id` | `resource.id` | |
| `target.horseId` | `resource.horseId` | **Mới**, luôn có. Với `HORSE` thì bằng `id` |
| `target: null` | `resource: null` | Thông báo không có trang để mở |

Danh sách `category`:

| `category` | Gồm các thông báo |
|---|---|
| `MEASUREMENT_ALERT` | Cảnh báo sốt, sụt cân |
| `EXAM_REQUEST` | Yêu cầu khám khẩn |
| `BARN_ASSIGNED` | Ngựa mới vào khu phụ trách |
| `GROOM_ASSIGNMENT` | Giao Groom, đổi Groom, Groom hết phụ trách do chuyển nhượng |
| `TRAINING_LOCK` | Đặt, gỡ khóa huấn luyện (`resource.type = TRAINING_LOCK`) |
| `HEALTH_STATUS` | Đổi trạng thái sức khỏe |
| `MEDICAL_CASE` | Mở, hủy, đóng, chỉnh chi phí bệnh án |
| `CARE_REMINDER` | Quá hạn khám định kỳ, lịch chăm sóc đến hạn |
| `HORSE_LIFECYCLE` | **Mới**: ngựa đã mất |
| `OWNERSHIP` | **Mới**: chuyển chủ nội bộ |

Yêu cầu khám và lịch chăm sóc vẫn trỏ về `HORSE`, chưa có loại `EXAM_REQUEST` hay `CARE_SCHEDULE` riêng. Nếu FE có màn hình riêng cho hai loại này thì báo BE để thêm.

Push FCM gửi trong `data` các key: `id`, `category`, `priority`, `resourceType`, `resourceId`, `horseId`.

---

## 7. BE-6. Câu xem trước đổi khu và tên vai trò **[FE sửa]**

Câu xem trước khi đổi khu:

- Có ô phải trả hoặc lớp phải rút: `Nếu chuyển Winx sang Khu C sẽ trả ô A-01 và rút khỏi 2 lớp. Groom Lan giữ nguyên. Ngựa vào danh sách Chờ xếp ô của Huấn luyện viên trưởng Hoa.`
- Không có gì phải trả hay rút: `Nếu chuyển Winx sang Khu C, ngựa vào danh sách Chờ xếp ô của khu mới.`

BE đổi luôn tên vai trò sang tiếng Việt ở các câu lỗi khác. **FE dò chữ "head trainer" thì đổi sang "huấn luyện viên trưởng"**:

| Câu cũ | Câu mới |
|---|---|
| `Khu chuồng chưa có Head Trainer phụ trách, không xếp ngựa vào được` | `Khu chuồng chưa có Huấn luyện viên trưởng phụ trách, không xếp ngựa vào được` |
| `Head Trainer phụ trách không hợp lệ` | `Huấn luyện viên trưởng phụ trách không hợp lệ` |
| `Head Trainer phụ trách không ở trạng thái hoạt động` | `Huấn luyện viên trưởng phụ trách không ở trạng thái hoạt động` |
| `Khu chuồng còn ngựa, không gỡ Head Trainer phụ trách được` | `Khu chuồng còn ngựa, không gỡ Huấn luyện viên trưởng phụ trách được` |
| `Khu chưa có Head Trainer đang hoạt động phụ trách` | `Khu chưa có Huấn luyện viên trưởng đang hoạt động phụ trách` |
| `...cần giao khu cho Head Trainer khác trước khi...` | `...cần giao khu cho Huấn luyện viên trưởng khác trước khi...` |
| `Sire phải là ngựa đực` | `Ngựa cha phải là ngựa đực` |
| `Dam phải là ngựa cái` | `Ngựa mẹ phải là ngựa cái` |
| `Sire và dam không được trùng nhau` | `Ngựa cha và ngựa mẹ không được trùng nhau` |
| `Sire không tồn tại` / `Dam không tồn tại` | `Ngựa cha không tồn tại` / `Ngựa mẹ không tồn tại` |
| `Ngựa đang là sire của ngựa khác, không thể đổi thành FEMALE` | `Ngựa đang là cha của ngựa khác, không thể đổi thành ngựa cái` |
| `Ngựa đang là dam của ngựa khác, phải giữ giới tính FEMALE` | `Ngựa đang là mẹ của ngựa khác, phải giữ giới tính ngựa cái` |
| `...vui lòng liên hệ Club Manager để xếp khu trước` | `...vui lòng liên hệ Quản lý câu lạc bộ để xếp khu trước` |
| `Khu đã hết ô trống, đề nghị Club Manager đổi khu cho ngựa` | `Khu đã hết ô trống, đề nghị Quản lý câu lạc bộ đổi khu cho ngựa` |
| `Câu lạc bộ phải còn ít nhất một Club Manager đang hoạt động` | `Câu lạc bộ phải còn ít nhất một Quản lý câu lạc bộ đang hoạt động` |
| `...Vui lòng liên hệ Club Manager.` (2 câu khi đăng nhập) | `...Vui lòng liên hệ Quản lý câu lạc bộ.` |
| `Người được giao phải là Veterinarian đang hoạt động, ...` | `Người được giao phải là Bác sĩ thú y đang hoạt động, ...` |
| `Chỉ người tạo yêu cầu hoặc Club Manager mới được chỉnh sửa` (kho vật tư) | `Chỉ người tạo yêu cầu hoặc Quản lý câu lạc bộ mới được chỉnh sửa` |

---

## 8. BE-7. Kiểm tra dữ liệu

BE đã chạy cả 3 câu SQL trong file, và thêm một câu kiểm ngựa quá 40 tuổi, trên **DB dev của BE** (17 ngựa). Cả 4 câu đều trả 0 dòng:
- Không có ngựa dưới 1 tuổi.
- Không có ngựa quá 40 tuổi.
- Không có cặp cha mẹ nào lớn hơn con chưa tới 2 năm.
- Không có ô loại `FOALING`.

BE chưa chạy trên **DB demo**. Nhờ nhóm chạy lại 3 câu trong file trên DB demo trước khi demo.

Khi cập nhật DB demo:
- Chạy `npm run db:migrate` để thêm cột `date_of_death` và bảng `horse_ownerships`. Migration tự tạo giai đoạn sở hữu cho dữ liệu cũ.
- Thông báo cũ trong Mongo chưa có `resource.horseId`. Muốn sạch thì xóa collection `notifications` rồi chạy `npm run db:seed:mongo`.

---

## 9. Câu hỏi cho nhóm

Nhật ký chuyển nhượng nội bộ ghi `feature: 'F1.4'` (Cập nhật hồ sơ), vì đặc tả Flow 1 đã gộp chủ sở hữu vào F1.4.

1. Có cần `resource.type` riêng cho yêu cầu khám (`EXAM_REQUEST`) và lịch chăm sóc (`CARE_SCHEDULE`) không? Chọn:
   - A: giữ trỏ về hồ sơ ngựa như hiện tại
   - B: thêm hai loại mới, FE mở thẳng màn tương ứng
