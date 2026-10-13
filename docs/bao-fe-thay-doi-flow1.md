# Báo FE: thay đổi API Flow 1 (hồ sơ ngựa)

> Cập nhật: 13/10/2026. Nhánh `truong-flow1-align`.

Có 2 thay đổi. Không đổi URL, mã HTTP hay câu báo lỗi; chỉ thêm thông tin để FE hiển thị đúng chỗ.

## 1. Lỗi cha/mẹ (phả hệ) giờ gắn vào ô nhập

API: `POST /api/v1/horses`, `PATCH /api/v1/horses/:horseId` (khi gửi `sireId`, `damId`).

Trước đây các lỗi dưới trả `errors: []`, FE không biết tô đỏ ô nào. Giờ có `errors` một phần tử chỉ ra ô:

| Lỗi | HTTP | `errors[0].field` |
|---|---|---|
| `Ngựa không thể là cha/mẹ của chính nó` | 400 | `sireId` hoặc `damId` (ô đang chọn chính con ngựa) |
| `Ngựa cha và ngựa mẹ không được trùng nhau` | 400 | `damId` |
| `Ngựa cha không tồn tại` | 400 | `sireId` |
| `Ngựa mẹ không tồn tại` | 400 | `damId` |
| `Quan hệ cha/mẹ tạo thành vòng lặp phả hệ` | 409 | `sireId` hoặc `damId` (ô gây vòng lặp) |

Ví dụ body 409:

```json
{
  "code": 409,
  "message": "Quan hệ cha/mẹ tạo thành vòng lặp phả hệ",
  "details": null,
  "errors": [
    { "field": "damId", "message": "Quan hệ cha/mẹ tạo thành vòng lặp phả hệ" }
  ],
  "correlationId": "…",
  "timestamp": "…"
}
```

FE cần làm: đọc `errors[].field` (như đang làm với `dateOfBirth`, `ownerId`) để hiện lỗi dưới ô chọn cha/mẹ. Lưu ý lỗi vòng lặp là 409 nhưng vẫn có `errors`.

## 2. Ô tìm kiếm ngựa: `%`, `_`, `\` là ký tự thường

API: `GET /api/v1/horses?search=...`

Trước đây gõ `_` khớp mọi ký tự, gõ `%` khớp mọi ngựa. Giờ tìm đúng chuỗi người dùng gõ.

| Gõ | Trước | Nay |
|---|---|---|
| `o_m` | `Sao_Mai`, `SaoXMai` | chỉ `Sao_Mai` |
| `%` | mọi ngựa | chỉ ngựa có `%` trong tên hoặc số chip |

FE cần làm: không cần đổi gì. Gửi nguyên chuỗi người dùng gõ, không tự escape (nếu FE đang tự thêm `\` trước `%` hay `_` thì bỏ, tránh escape hai lần).
