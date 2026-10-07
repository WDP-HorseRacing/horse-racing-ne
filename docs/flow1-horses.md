# Đề bài

> Cập nhật: 07/10/2026

## Hệ thống Quản lý Huấn luyện Ngựa đua — Racehorse Training & Management System

### Actors

- Head Trainer
- Veterinarian
- Groom / Stable Hand
- Horse Owner
- Club Manager

### Main features

**Head Trainer (Huấn luyện viên Trưởng)**

- Xem bảng tiến độ và biểu đồ thể lực tổng quan của toàn bộ chiến mã trong câu lạc bộ.
- Lập giáo án huấn luyện chi tiết (cự ly, khối lượng, mặt sân) theo từng giai đoạn cho từng con ngựa.
- Phân công lịch tập luyện hàng ngày cho đội ngũ chăm sóc và quản lý lượt chạy thử.
- Xem cảnh báo vượt ngưỡng thể lực hoặc nguy cơ chấn thương dựa trên dữ liệu nhịp tim/vận tốc realtime.
- Đánh giá phong độ, ghi nhận chỉ số buổi tập và đưa ra nhận xét chuyên môn sau mỗi buổi tập.
- Lựa chọn chiến mã và đăng ký tham gia các giải đua phù hợp.

**Veterinarian (Bác sĩ Thú y)**

- Xem sơ đồ trạng thái sức khỏe (Đủ điều kiện, Cần theo dõi, Chấn thương, Cách ly) của toàn bộ đàn ngựa trên giao diện chuồng trại.
- Ghi nhận hồ sơ khám bệnh, chẩn đoán chi tiết và cập nhật phác đồ điều trị/đơn thuốc.
- Đánh dấu vị trí chấn thương trên mô hình cơ/xương 3D của ngựa để theo dõi diễn biến phục hồi.
- Đặt lệnh "Khóa huấn luyện" khẩn cấp đối với ngựa chấn thương để ngăn chặn xếp lịch bài tập nặng.
- Theo dõi và nhận thông báo tự động về lịch tiêm phòng, tẩy giun, kiểm tra móng (Farrier) định kỳ.

**Groom / Stable Hand (Nhân viên Chăm sóc & Chuồng trại)**

- Xem sơ đồ phân bổ vị trí chuồng trại và lịch trình sinh hoạt hàng ngày của từng con ngựa.
- Xem chi tiết khẩu phần ăn (ngũ cốc, cỏ, vitamin) được duyệt cho từng bữa trong ngày.
- Đánh dấu xác nhận hoàn thành công việc (Cho ăn, Vệ sinh chuồng, Tắm rửa, Ngâm chân nước đá).
- Gửi báo cáo sự cố đột xuất tại chuồng (Ngựa bỏ ăn, Có dấu hiệu đau bụng/sốt, Móng bị xước) kèm hình ảnh thực tế.
- Theo dõi danh sách vật tư (Thức ăn, Thuốc, Dụng cụ) tại khu vực phụ trách để đề xuất bổ sung.

**Horse Owner (Chủ sở hữu Ngựa)**

- Xem hồ sơ lý lịch, dòng dõi (Pedigree) và lịch sử thành tích thi đấu của ngựa thuộc sở hữu.
- Theo dõi chỉ số sức khỏe, cân nặng và trạng thái sẵn sàng thi đấu theo thời gian thực.
- Xem lịch trình tập luyện, video các buổi đua thử và nhật ký nhận xét từ HLV Trưởng.
- Nhận báo cáo tổng hợp chi phí nuôi dưỡng, y tế và doanh thu tiền thưởng định kỳ.

**Club Manager (Quản lý Câu lạc bộ)**

- Quản lý danh mục tổng (Danh sách ngựa, Danh sách nhân sự, Danh mục vật tư y tế & thức ăn).
- Phân quyền truy cập và chức năng thao tác (RBAC) cho từng vai trò trong hệ thống.
- Xem báo cáo tổng quan về hiệu suất huấn luyện, chi phí vận hành chuồng trại và doanh thu giải đấu.
- Theo dõi nhật ký thao tác hệ thống (Audit Log) để đảm bảo an toàn thông tin và tính minh bạch.

### Must have

- Flow 1: Luồng Quản lý Hồ sơ & Lý lịch Ngựa (REQUIRED)
- Flow 2: Luồng Lập & Thực hiện Giáo án Huấn luyện (REQUIRED)
- Flow 3: Luồng Quản lý Y tế & Xử lý Chấn thương (REQUIRED)

### Nice to have

- Flow 4: Luồng Chăm sóc Chuồng trại & Dinh dưỡng Hàng ngày (OPTIONAL)
- Flow 5: Luồng Đăng ký Thi đấu & Báo cáo Thành tích (OPTIONAL)

---

# Flow 1: Luồng Quản lý Hồ sơ & Lý lịch Ngựa

## I. Những main feature liên quan

**CLUB MANAGER (Quản lý Câu lạc bộ)**

- Quản lý danh mục tổng (Danh sách ngựa).
- Phân quyền truy cập và chức năng thao tác (RBAC) cho từng vai trò trong hệ thống.
- Theo dõi nhật ký thao tác hệ thống (Audit Log).

**HORSE OWNER (Chủ sở hữu Ngựa)**

- Xem hồ sơ lý lịch, dòng dõi (Pedigree) và lịch sử thành tích thi đấu của ngựa thuộc sở hữu.
- Theo dõi chỉ số sức khỏe, cân nặng và trạng thái sẵn sàng thi đấu.

**HEAD TRAINER (Huấn luyện viên Trưởng)**

- Phân công lịch tập luyện hàng ngày cho đội ngũ chăm sóc (phần phân công Groom phụ trách ngựa).

**VETERINARIAN (Bác sĩ Thú y)**

- Xem sơ đồ trạng thái sức khỏe của toàn bộ đàn ngựa trên giao diện chuồng trại (Flow 1 cung cấp dữ liệu hồ sơ và vị trí chuồng).

**GROOM / STABLE HAND (Nhân viên Chăm sóc & Chuồng trại)**

- Xem sơ đồ phân bổ vị trí chuồng trại của từng con ngựa.

## II. Chức năng

| Mã | Tên chức năng |
|---|---|
| F1.1 | Xem danh sách ngựa (Xem) |
| F1.2 | Tạo hồ sơ ngựa mới (Thêm) |
| F1.3 | Xem chi tiết hồ sơ và phả hệ (Xem) |
| F1.4 | Cập nhật hồ sơ ngựa (Sửa) |
| F1.5 | Ghi nhận chỉ số cơ thể (Thêm, Xóa, Xem) |
| F1.6 | Xếp khu chuồng cho ngựa (Sửa, Xem) |
| F1.7 | Xếp ô chuồng và phân công Groom (Sửa, Xem) |
| F1.8 | Thay đổi trạng thái vòng đời và xóa hồ sơ (Sửa, Xóa) |

## III. Quy ước chung

Phần này áp dụng cho toàn bộ các chức năng F1.1 đến F1.8, không lặp lại ở từng chức năng.

### 1. Phạm vi dữ liệu của từng vai trò

| Vai trò | Phạm vi xem | Phạm vi thao tác |
|---|---|---|
| CLUB MANAGER | Toàn câu lạc bộ, kể cả hồ sơ đã xóa | Toàn câu lạc bộ |
| HEAD TRAINER | Toàn câu lạc bộ | Ngựa thuộc khu chuồng mình phụ trách |
| VETERINARIAN | Toàn câu lạc bộ | Toàn câu lạc bộ (nội dung y tế, thuộc Flow 3) |
| GROOM | Toàn câu lạc bộ | Ngựa được phân công phụ trách |
| HORSE OWNER | Ngựa mình sở hữu | Không thao tác |

1. Một khu chuồng có đúng một HEAD TRAINER phụ trách. Một HEAD TRAINER có thể phụ trách nhiều khu.
2. Ngựa chưa được xếp khu thì không HEAD TRAINER nào thao tác được, chỉ CLUB MANAGER xử lý.
3. Ngựa ngoài phạm vi thao tác vẫn xem được hồ sơ nhưng không hiện nút thao tác nào (chỉ đọc).
4. GROOM được phân công theo từng con ngựa, không theo khu. Một GROOM có thể phụ trách nhiều ngựa ở nhiều khu khác nhau.
5. Không khóa được tài khoản của người còn đang phụ trách: GROOM còn ngựa được giao, HORSE OWNER còn ngựa đang ở câu lạc bộ (Đang hoạt động hoặc Đã giải nghệ), HEAD TRAINER còn khu. Phải bàn giao trước (đổi GROOM, chuyển nhượng nội bộ sang chủ khác, đổi HEAD TRAINER của khu), giống luật đổi vai trò tài khoản. Mở lại tài khoản thì không chặn. *(BA chốt)*

### 2. Trạng thái sức khỏe (do Flow 3 cập nhật, Flow 1 chỉ hiển thị)

1. Bốn giá trị:
   - **Đủ điều kiện (ELIGIBLE):** khỏe mạnh, tập và đua bình thường.
   - **Cần theo dõi (UNDER_OBSERVATION):** có dấu hiệu bất thường nhưng chưa xác định bệnh. Chỉ tập cường độ Nhẹ và Trung bình, không được đăng ký đua.
   - **Chấn thương (INJURED):** đang có tổn thương. Không tập, không đua.
   - **Cách ly (QUARANTINED):** nghi nhiễm bệnh truyền nhiễm. Không tập, không đua.
2. Trạng thái Cách ly là trạng thái y tế, không bắt buộc hệ thống phải chuyển ngựa sang một loại ô chuồng riêng. Nếu cần tách ngựa khỏi đàn, HEAD TRAINER phụ trách khu chuyển ngựa sang ô trống bằng F1.7.

### 3. Trạng thái vòng đời

1. Bốn giá trị:
   - **Đang hoạt động (ACTIVE):** dùng đầy đủ mọi chức năng.
   - **Đã giải nghệ (RETIRED):** vẫn ở lại câu lạc bộ, vẫn được chăm sóc và chữa bệnh, không học lớp và không đăng ký đua.
   - **Đã chuyển nhượng (TRANSFERRED):** đã rời khỏi câu lạc bộ. Hồ sơ chuyển sang chỉ đọc.
   - **Đã mất (DECEASED):** ngựa đã chết. Hồ sơ chuyển sang chỉ đọc, vẫn là hồ sơ của câu lạc bộ, chủ ngựa vẫn xem được.
2. Chuyển trạng thái đi và về đều được: ACTIVE ⇄ RETIRED, ACTIVE ⇄ TRANSFERRED, và RETIRED → TRANSFERRED (bán ngựa đã giải nghệ, xem F1.8 mục 2; bổ sung cho khớp F1.8). Trường hợp câu lạc bộ mua lại con ngựa đã bán thì kích hoạt lại hồ sơ cũ, không tạo hồ sơ mới (xem F1.8).
3. ACTIVE → DECEASED và RETIRED → DECEASED được (ghi nhận ngựa mất, xem F1.8 mục 2b). Đã mất là trạng thái cuối, không chuyển sang trạng thái nào khác. Ngựa đã chuyển nhượng không ghi nhận mất được vì không còn ở câu lạc bộ.

### 4. Quy tắc "được tập" và "được đua"

1. **Được tập:** vòng đời ACTIVE, sức khỏe ELIGIBLE hoặc UNDER_OBSERVATION, và không có lệnh khóa huấn luyện của bác sĩ.
2. **Được đua:** vòng đời ACTIVE, sức khỏe ELIGIBLE, và không có lệnh khóa huấn luyện.
3. Hai giá trị này được tính lại mỗi lần hiển thị, không lưu vào cơ sở dữ liệu.
4. Khi kết quả là không được phép, hệ thống phải hiện lý do cụ thể.

### 5. Phụ thuộc giữa các flow

| Flow | Flow 1 nhận gì / cung cấp gì |
|---|---|
| Flow 2 (Huấn luyện) | Cung cấp danh mục khu chuồng, ô chuồng và việc gán HEAD TRAINER phụ trách khu. Cung cấp lớp học và buổi tập. Flow 1 chỉ xếp ngựa vào khu, vào ô chứ không tạo khu và ô. |
| Flow 3 (Y tế) | Cập nhật trạng thái sức khỏe, lệnh khóa huấn luyện, bệnh án và các buổi khám. Ghi số đo vào bảng chỉ số cơ thể của F1.5. |
| Flow 4 (Chăm sóc) | Đọc điểm thể trạng từ F1.5 để tính khẩu phần. Quản lý gói chăm sóc do chủ ngựa chọn. |
| Flow 5 (Thi đấu) | Cung cấp lịch sử thành tích hiển thị trong F1.3. |

### 6. Nhật ký thao tác

1. Mọi thao tác Thêm, Sửa, Xóa trong Flow 1 đều ghi nhật ký: người thực hiện, thời điểm, chức năng, đối tượng, giá trị trước và sau, lý do (nếu chức năng yêu cầu nhập lý do).
2. Dữ liệu ngoài quyền phải được loại bỏ trước khi gửi về máy người dùng. Trường bị ẩn thì không có trong dữ liệu trả về, không gửi đủ rồi ẩn ở giao diện.
3. Truy cập ngoài phạm vi trả về 404. Mã 403 chỉ dùng khi người dùng xem được con ngựa nhưng không được thực hiện một thao tác cụ thể, hoặc vai trò không có quyền làm thao tác đó. Có quyền nhưng trạng thái dữ liệu không cho phép (ví dụ hồ sơ đã chuyển nhượng, khu hết chỗ, hai người cùng lưu) thì trả 409 kèm lý do. *(BA chốt)*
   - CLUB MANAGER thao tác ghi trên hồ sơ đã xóa: 409 "Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác". Vai trò khác không thấy hồ sơ đã xóa nên nhận 404. *(BA chốt)*
   - Chọn một tài khoản (chủ sở hữu, HEAD TRAINER phụ trách khu, GROOM) mà tài khoản đó không còn hoạt động: 409. Chọn sai tài khoản hoặc tài khoản sai vai trò: 400. *(BA chốt)*
4. Đổi vòng đời ghi một dòng nhật ký cho con ngựa, kèm đủ các hệ quả đã xảy ra: ô chuồng được trả, GROOM bị kết thúc phân công, lệnh khóa huấn luyện được gỡ, số yêu cầu khám bị bỏ qua, lịch hẹn khám và lịch chăm sóc bị hủy, số đăng ký thi đấu bị rút, số lớp bị rút, chủ bị bỏ trống, ngày mất (khi ghi nhận ngựa mất). *(BA chốt)*

## Phụ lục: Thay đổi so với bản trước

Phần này để chiếu nhanh, không phải nội dung đặc tả.

| Nội dung bản cũ | Bản mới | Lý do |
|---|---|---|
| Nhiều chủ sở hữu, tỉ lệ phần trăm, chủ đại diện | Mỗi con ngựa có nhiều nhất một chủ | Góp ý của giảng viên: tỉ lệ phần trăm không tạo ra giá trị chức năng nào vì dự án không hỗ trợ thanh toán. |
| Ngựa tham chiếu (ngựa ngoài chỉ dùng cho phả hệ) | Bỏ hoàn toàn. Cha mẹ không có trong câu lạc bộ thì để trống | Không phục vụ chức năng nào ngoài việc hiển thị, nhưng kéo theo rất nhiều ngoại lệ ở mọi chức năng. |
| F1.5 Quản lý phả hệ và F1.6 Quản lý quyền sở hữu là hai chức năng riêng | Gộp vào F1.2 và F1.4 | Khi chỉ còn một chủ và không còn ngựa tham chiếu, cha, mẹ và chủ sở hữu chỉ là các trường của hồ sơ. |
| F1.8 Quản lý ảnh hồ sơ ngựa là chức năng riêng | Gộp vào F1.2 và F1.4 | Ảnh đại diện là một trường của hồ sơ. Việc tải tệp là chi tiết kỹ thuật, không phải chức năng nghiệp vụ. |
| Lịch sử sở hữu có ngày bắt đầu và ngày kết thúc | Chỉ lưu chủ hiện tại | Báo cáo chi phí theo giai đoạn sở hữu không nằm trong phạm vi các flow bắt buộc. Đã đổi lại, xem dòng chuyển nhượng nội bộ bên dưới. |
| CLUB MANAGER xếp ô chuồng và đổi GROOM | CLUB MANAGER xếp khu, HEAD TRAINER xếp ô và phân công GROOM | Góp ý của giảng viên: CLUB MANAGER không ôm chuyên môn của vai trò khác. |
| CLUB MANAGER sửa được sở trường cự ly | Chỉ HEAD TRAINER sửa | Đây là đánh giá chuyên môn huấn luyện. |
| Bắt buộc chuyển ngựa cách ly sang loại "Ô cách ly" | Cách ly chỉ là trạng thái y tế. Cần tách đàn thì HEAD TRAINER chuyển ô bằng F1.7 | Ô cách ly không có trong đề bài và làm một tình huống khẩn cấp phải đi qua nhiều vai trò. |
| GROOM gắn theo ô chuồng, chuyển chuồng thì mất quyền truy cập | GROOM gắn theo con ngựa, một GROOM phụ trách nhiều ngựa ở nhiều khu | Việc chăm sóc diễn ra hằng ngày với con ngựa, không phụ thuộc ô chuồng. |
| Bảng thông tin hiển thị của F1.3 gồm 15 mục, nhiều ô "xem rút gọn" | Gộp còn 4 nhóm, bỏ toàn bộ ô "xem rút gọn" | Các mục có quyền giống hệt nhau thì tách ra không có tác dụng, mỗi ô rút gọn lại là một nhánh xử lý phải làm riêng. |
| Mục chi phí và tiền thưởng trong hồ sơ chi tiết | Bỏ, chỉ giữ tổng chi phí y tế trong tab bệnh án | Thuộc báo cáo tài chính, không nằm trong flow bắt buộc. |
| Danh sách 14 điều kiện chặn xóa hồ sơ | Gộp thành một quy tắc chung | Danh sách dài dễ lệch với thực tế khi các flow khác thay đổi. |
| Đã chuyển nhượng là trạng thái cuối | Cho phép kích hoạt lại hồ sơ cũ | Trường hợp câu lạc bộ mua lại ngựa: tạo hồ sơ mới sẽ vướng số chip trùng và mất toàn bộ phả hệ, bệnh án, thành tích. |
| Phân quyền ghi chỉ số cơ thể theo từng loại chỉ số | Vai trò nào được ghi thì ghi được cả bốn loại | Phân quyền theo từng loại làm tăng số nhánh xử lý mà không phục vụ yêu cầu nào của đề bài. |
| Ngày sinh dùng để chặn vòng lặp phả hệ | Kiểm tra vòng lặp một cách tường minh | Ngày sinh không bắt buộc nên không thể dựa vào nó để chặn vòng lặp. |
| Ngày sinh chỉ cần không ở tương lai | Ngựa phải đủ 1 tuổi và không quá 40 tuổi | Câu lạc bộ chỉ quản lý ngựa từ 1 tuổi, ngựa non ở trại giống. Mức 40 tuổi để bắt lỗi gõ nhầm năm. |
| Cha mẹ chỉ cần sinh trước con | Cha mẹ phải lớn hơn con ít nhất 2 năm | Ngựa cái dậy thì khoảng 12 đến 15 tháng và mang thai khoảng 11 tháng, ngựa đực hiếm khi được phối trước 2 tuổi. |
| Ngựa chết chỉ xử lý được bằng giải nghệ, chuyển nhượng hoặc xóa | Thêm trạng thái Đã mất | Giải nghệ thì ngựa vẫn chiếm ô và bị nhắc khám, chuyển nhượng sai nghĩa, xóa thì bị chặn vì đã có dữ liệu. |
| Thông báo ngựa mất không gửi CLUB MANAGER | Gửi mọi CLUB MANAGER đang hoạt động | Bác sĩ ghi nhận mất khi đóng bệnh án thì CLUB MANAGER không biết ngựa đã mất; CLB có thể có nhiều CLUB MANAGER. Giống các thông báo y tế của Flow 3. |
| Chỉ CLUB MANAGER ghi nhận ngựa mất, phải chờ bác sĩ đóng bệnh án trước | Bác sĩ đóng bệnh án kèm ngày mất, hệ thống ghi nhận mất cùng lúc | Ngựa thường mất trong lúc điều trị. Chờ hai bước thì ngựa vẫn hiện Đang hoạt động, vẫn trong lớp và vẫn được giao GROOM. Ngoài thực tế, bác sĩ thú y là người xác nhận ngựa chết. |
| Đổi chủ bằng sửa trường chủ sở hữu, chỉ lưu chủ hiện tại | Chuyển nhượng nội bộ, lưu lịch sử giai đoạn sở hữu | Góp ý của giảng viên: chỉ sửa trường chủ là CRUD, chưa phải chuyển nhượng. Chi phí y tế phải tính cho người làm chủ lúc bệnh án được đóng, không dồn hết cho chủ hiện tại. |

---

## F1.1 — Xem danh sách ngựa (Xem)

### Mô tả

Liệt kê ngựa của câu lạc bộ, có tìm kiếm theo tên hoặc số chip định danh và lọc theo thông tin. Danh sách chỉ hiện thông tin tóm tắt, muốn xem đầy đủ phải mở hồ sơ chi tiết ở F1.3.

### Phân quyền — quyền thao tác

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Vai trò duy nhất bật được bộ lọc "hồ sơ đã xóa". Có bộ lọc riêng "Chờ xếp khu". |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Có bộ lọc "Khu của tôi" và "Chờ xếp ô". Danh sách không có nút thao tác nên không đánh dấu từng dòng; dùng bộ lọc "Khu của tôi" để thấy ngựa mình phụ trách *(BA chốt)*. |
| VETERINARIAN | Xem | Toàn câu lạc bộ | Mặc định lọc sẵn những con đang chấn thương, cách ly và cần theo dõi lên đầu. |
| GROOM | Xem | Toàn câu lạc bộ | Có bộ lọc "Ngựa tôi phụ trách". Chỉ thao tác được trên những con được phân công. |
| HORSE OWNER | Xem | Ngựa sở hữu | |

### Phân quyền — thông tin hiển thị

Viết tắt: CM = Club Manager, HT = Head Trainer, VET = Veterinarian, GROOM = Groom / Stable Hand, OWNER = Horse Owner.

| Mục thông tin | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| Thông tin tóm tắt: ảnh, tên, giới tính, giống, màu lông, ngày sinh, số chip định danh, sở trường cự ly, trạng thái sức khỏe, trạng thái vòng đời, khu chuồng và mã ô chuồng hiện tại | Xem | Xem | Xem | Xem | Xem |

Mọi vai trò xem cùng một lượng thông tin ở màn hình danh sách. Khác biệt giữa các vai trò nằm ở phạm vi dữ liệu và ở màn hình chi tiết (F1.3).

### Nghiệp vụ

1. Danh sách mặc định không hiện hồ sơ đã xóa. Chỉ CLUB MANAGER bật được bộ lọc này và các hồ sơ đó hiện kèm dấu phân biệt.
2. Tìm kiếm theo tên hoặc số chip định danh. Bộ lọc gồm: trạng thái sức khỏe, trạng thái vòng đời, khu chuồng, giới tính, sở trường cự ly.
3. Thứ tự mặc định: ngựa đang chấn thương và đang cách ly xếp lên trên, sau đó tới cần theo dõi, cuối cùng là còn lại. Mục đích là để việc cần xử lý gấp đập vào mắt trước.
4. Ngựa chưa được xếp khu hiện nhãn "Chờ xếp khu". Ngựa đã có khu nhưng chưa có ô hiện nhãn "Chờ xếp ô".
5. Danh sách phân trang. Đổi từ khóa hoặc đổi bộ lọc thì quay về trang đầu.
6. Ngựa đã chuyển nhượng vẫn hiện trong danh sách nhưng có nhãn riêng và không có nút thao tác.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-01 |
| **Tên use case** | Xem danh sách ngựa |
| **Actor chính** | CLUB MANAGER, HEAD TRAINER, VETERINARIAN, GROOM, HORSE OWNER |
| **Actor phụ** | Không |
| **Tiền điều kiện** | Người dùng đã đăng nhập, tài khoản đang hoạt động |
| **Hậu điều kiện** | Danh sách ngựa trong phạm vi quyền được hiển thị theo trang |
| **Luồng sự kiện chính** | 1. Người dùng chọn menu "Danh sách ngựa".<br>2. Hệ thống xác định vai trò và phạm vi dữ liệu của người dùng.<br>3. Hệ thống lấy danh sách ngựa trong phạm vi, bỏ qua hồ sơ đã xóa.<br>4. Hệ thống sắp xếp những con cần xử lý gấp lên đầu và hiển thị trang đầu tiên.<br>5. Người dùng xem danh sách. |
| **Luồng thay thế** | A1. Người dùng nhập từ khóa → hệ thống lọc theo tên hoặc số chip định danh.<br>A2. Người dùng chọn bộ lọc → hệ thống lọc lại và quay về trang đầu.<br>A3. CLUB MANAGER bật "hiện hồ sơ đã xóa" → hệ thống hiển thị thêm các hồ sơ này kèm dấu phân biệt.<br>A4. HEAD TRAINER chọn "Khu của tôi" hoặc GROOM chọn "Ngựa tôi phụ trách" → hệ thống lọc theo phạm vi tương ứng.<br>A5. Người dùng chuyển trang → hệ thống tải trang tương ứng. |
| **Luồng ngoại lệ** | E1. Không có con ngựa nào phù hợp → hiện màn hình trống kèm gợi ý bỏ bớt bộ lọc.<br>E2. Phiên đăng nhập hết hạn → chuyển về màn hình đăng nhập. |

---

## F1.2 — Tạo hồ sơ ngựa mới (Thêm)

### Mô tả

Tạo mới một con ngựa cho câu lạc bộ. Trong cùng một thao tác có thể nhập luôn ảnh đại diện, cha mẹ, chủ sở hữu và chọn khu chuồng, hoặc để trống bổ sung sau.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Thêm | Toàn câu lạc bộ | Nhập ngựa là việc quản lý hành chính, cần kiểm tra giấy tờ trước khi nhận ngựa. |
| HEAD TRAINER | Không | | Đề xuất nhập ngựa qua trao đổi trực tiếp. |
| VETERINARIAN | Không | | |
| GROOM | Không | | |
| HORSE OWNER | Không | | |

### Nghiệp vụ

1. Bắt buộc nhập tên ngựa và giới tính. Các thông tin còn lại có thể để trống, kể cả ngày sinh, số chip, chủ sở hữu và khu chuồng.
2. Số chip định danh không được trùng với bất kỳ con nào khác, kể cả hồ sơ đã xóa hoặc đã chuyển nhượng. Đây là mã duy nhất gắn với con vật ngoài đời thật.
3. Ngày sinh (nếu nhập) phải cho thấy ngựa đủ 1 tuổi và không quá 40 tuổi, tính theo ngày lịch Việt Nam: không muộn hơn ngày này năm trước (hôm nay là 29/02 thì mốc là 28/02 năm trước) và không sớm hơn ngày này 40 năm trước.
4. Giới tính có 3 giá trị:
   - Đực (MALE)
   - Cái (FEMALE)
   - Đực đã thiến (GELDING)
5. Sở trường cự ly có 3 giá trị. CLUB MANAGER không nhập lúc tạo hồ sơ; để trống và HEAD TRAINER phụ trách khu bổ sung sau bằng F1.4:
   - Cự ly ngắn (SPRINTER): dưới khoảng 1400 mét.
   - Cự ly trung bình (MILER): khoảng 1400 đến 1800 mét.
   - Đường dài (STAYER): trên 1800 mét.
6. Khai báo cha và mẹ:
   - Chỉ chọn được trong số ngựa đang có hồ sơ tại câu lạc bộ, kể cả ngựa đã giải nghệ hoặc đã chuyển nhượng. Không chọn được hồ sơ đã xóa.
   - Cha phải là MALE hoặc GELDING. Mẹ phải là FEMALE. Cha và mẹ phải khác nhau.
   - Nếu cả con và cha (hoặc mẹ) đều có ngày sinh thì cha mẹ phải lớn hơn con ít nhất 2 năm; đúng bằng 2 năm thì được. Thiếu ngày sinh ở một bên thì bỏ qua kiểm tra này.
   - Không được tạo vòng lặp: một con ngựa không được là tổ tiên của chính nó.
   - Cha hoặc mẹ không có trong câu lạc bộ thì để trống. Hệ thống không lưu ngựa ngoài dưới bất kỳ dạng nào.
7. Chủ sở hữu: mỗi con ngựa có nhiều nhất một chủ, chọn từ danh sách tài khoản HORSE OWNER. Có thể để trống và gán sau bằng F1.4. Có chọn chủ thì hệ thống mở giai đoạn sở hữu đầu tiên, bắt đầu từ lúc tạo hồ sơ.
8. Ảnh đại diện: mỗi con ngựa có một ảnh, định dạng JPEG, PNG hoặc WebP, dung lượng tối đa 10 MB.
9. Khu chuồng: chỉ chọn được khu đang hoạt động, có HEAD TRAINER đang hoạt động phụ trách, và còn chỗ nhận ngựa. Số chỗ còn nhận = số ô trống − số ngựa của khu đang chờ xếp ô (ví dụ khu có 2 ô trống nhưng đã có 2 ngựa chờ xếp ô thì hết chỗ). *(BA chốt)* Không chọn thì ngựa nằm trong danh sách "Chờ xếp khu" của CLUB MANAGER.
10. Hồ sơ mới tạo luôn bắt đầu ở trạng thái sức khỏe "Đủ điều kiện" và trạng thái vòng đời "Đang hoạt động". Không được tự chọn hai giá trị này lúc tạo.
11. Việc tạo hồ sơ và xếp khu phải thành công hoặc thất bại cùng nhau (Atomic).
12. Ghi nhật ký thao tác.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-02 |
| **Tên use case** | Tạo hồ sơ ngựa mới |
| **Actor chính** | CLUB MANAGER |
| **Actor phụ** | Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | CLUB MANAGER đã đăng nhập. Nếu muốn xếp khu ngay thì phải có khu còn nhận được ngựa (mục 9). |
| **Hậu điều kiện** | Hồ sơ ngựa được tạo ở trạng thái Đủ điều kiện và Đang hoạt động. Nếu có chọn khu thì ngựa thuộc khu đó và nằm trong danh sách "Chờ xếp ô" của HEAD TRAINER phụ trách khu. |
| **Luồng sự kiện chính** | 1. CLUB MANAGER chọn "Thêm ngựa mới".<br>2. Hệ thống hiển thị biểu mẫu khai báo.<br>3. CLUB MANAGER nhập thông tin cơ bản và tải ảnh đại diện.<br>4. CLUB MANAGER chọn cha và mẹ từ danh sách ngựa của câu lạc bộ (có thể bỏ qua).<br>5. CLUB MANAGER chọn chủ sở hữu (có thể bỏ qua).<br>6. CLUB MANAGER chọn khu chuồng (có thể bỏ qua).<br>7. CLUB MANAGER gửi biểu mẫu.<br>8. Hệ thống kiểm tra các điều kiện hợp lệ.<br>9. Hệ thống tạo hồ sơ và xếp khu trong cùng một giao dịch.<br>10. Hệ thống ghi nhật ký và mở màn hình chi tiết. |
| **Luồng thay thế** | A1. CLUB MANAGER chọn "Lưu và thêm tiếp" → hệ thống giữ biểu mẫu trống để nhập con tiếp theo.<br>A2. Bỏ qua phần chủ sở hữu hoặc khu chuồng → bổ sung sau bằng F1.4 và F1.6.<br>A3. Chưa rõ sở trường cự ly → để trống, HEAD TRAINER bổ sung sau bằng F1.4. |
| **Luồng ngoại lệ** | E1. Số chip định danh trùng → báo lỗi ngay tại ô nhập.<br>E2. Ngày sinh cho thấy ngựa chưa đủ 1 tuổi hoặc quá 40 tuổi → báo lỗi tại ô ngày sinh.<br>E3. Cha hoặc mẹ sai giới tính, trùng nhau, chưa lớn hơn con 2 năm hoặc tạo vòng lặp → báo lỗi tại ô cha hoặc mẹ.<br>E4. Khu chuồng vừa hết ô trống → tải lại danh sách khu.<br>E5. Lưu thất bại giữa chừng → hủy toàn bộ, không tạo hồ sơ. |

---

## F1.3 — Xem chi tiết hồ sơ và phả hệ (Xem)

### Mô tả

Màn hình hồ sơ đầy đủ của một con ngựa. Tab đầu tiên là thông tin do Flow 1 quản lý, gồm cả cây phả hệ (Pedigree) và chỉ số cơ thể. Các tab còn lại là dữ liệu tổng hợp từ Flow 2, Flow 3 và Flow 5.

### Phân quyền — quyền thao tác

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Xem được cả hồ sơ đã xóa, có nhãn "Đã xóa". |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Ngựa ngoài khu phụ trách không hiện nút thao tác nào. |
| VETERINARIAN | Xem | Toàn câu lạc bộ | |
| GROOM | Xem | Toàn câu lạc bộ | Chỉ thao tác trên con ngựa được phân công. |
| HORSE OWNER | Xem | Ngựa sở hữu | |

### Phân quyền — thông tin hiển thị

| Mục thông tin | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| 1. Thông tin hồ sơ: định danh, ảnh, số chip, sở trường cự ly, trạng thái sức khỏe và vòng đời, được tập / được đua, cây phả hệ, chủ sở hữu, khu và ô chuồng, GROOM phụ trách, chỉ số cơ thể và biểu đồ | Xem | Xem | Xem | Xem | Xem |
| 2. Bệnh án: danh sách bệnh án, các buổi khám (Flow 3) | Xem | Xem | Xem | Không | Xem |
| 2b. Tổng chi phí y tế của các bệnh án đã đóng (Flow 3) | Xem | Không | Xem | Không | Xem |
| 3. Huấn luyện: lớp đang học, lịch buổi tập, kết quả và nhận xét sau buổi tập (Flow 2) | Xem | Xem | Xem | Không | Xem |
| 4. Thành tích thi đấu (Flow 5) | Xem | Xem | Không | Không | Xem |

GROOM không xem hai tab Bệnh án và Huấn luyện ở màn hình này; dữ liệu của hai tab này không được gửi về máy GROOM. Phần thông tin GROOM cần để làm việc (giờ tập trong ngày, khẩu phần) nằm ở lịch công việc hằng ngày thuộc Flow 2 và Flow 4.

Ảnh đại diện: ai xem được hồ sơ ngựa thì xem được ảnh của ngựa đó. Với hồ sơ đã xóa, CLUB MANAGER vẫn xem được (chỉ đọc) bệnh án, chỉ số, thành tích, kết quả đua và lịch sử GROOM như khi xem hồ sơ. *(BA chốt)*

### Nghiệp vụ

1. Tab 1 tải cùng hồ sơ. Các tab 2, 3, 4 là dữ liệu từ flow khác nên tải riêng khi người dùng mở tab, không tải hết một lần.
2. Khi con ngựa không được tập hoặc không được đua, hệ thống phải hiện lý do cụ thể, ví dụ "Đang chấn thương", "Đang bị khóa huấn luyện", "Đã giải nghệ".
3. Cây phả hệ:
   - Hiển thị tối đa 3 đời: con ngựa đang xem, cha mẹ, ông bà.
   - Chỉ vẽ từ những con có hồ sơ tại câu lạc bộ. Ô nào không khai báo được thì để trống.
   - Bấm vào một tổ tiên sẽ mở hồ sơ của con đó theo đúng phạm vi quyền của người xem. Với HORSE OWNER, nếu tổ tiên không thuộc sở hữu của mình thì chỉ hiện tên và vị trí trong cây (cha/mẹ của ai, đời mấy), không mở được và không nhận giới tính, giống, màu lông, ngày sinh, sở trường của con đó. *(BA chốt)* Hệ thống vẫn gửi mã định danh của tổ tiên đó để giao diện nối các ô trong cây; mở hồ sơ tổ tiên đó vẫn bị chặn. *(BA chốt)*
4. Hồ sơ đã chuyển nhượng, đã mất và hồ sơ đã xóa hiển thị ở chế độ chỉ đọc, không hiện nút thao tác nào, trừ nút "Kích hoạt lại" (ngựa đã chuyển nhượng) và "Khôi phục" (hồ sơ đã xóa) của CLUB MANAGER theo F1.8. Ngựa đã mất không có nút nào. *(BA chốt)*
5. Con ngựa ngoài phạm vi xem trả về 404, không trả 403. Áp dụng cho HORSE OWNER xem ngựa không sở hữu và cho các vai trò khác CLUB MANAGER xem hồ sơ đã xóa.
6. Hồ sơ có chủ hiện ngày bắt đầu sở hữu của chủ hiện tại (ví dụ "Chủ sở hữu từ 01/06/2026").

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-03 |
| **Tên use case** | Xem chi tiết hồ sơ và phả hệ |
| **Actor chính** | CLUB MANAGER, HEAD TRAINER, VETERINARIAN, GROOM, HORSE OWNER |
| **Actor phụ** | Không |
| **Tiền điều kiện** | Người dùng đã đăng nhập. Con ngựa nằm trong phạm vi xem của người dùng. |
| **Hậu điều kiện** | Thông tin trong phạm vi quyền được hiển thị. Các trường ngoài quyền không có trong dữ liệu trả về. |
| **Luồng sự kiện chính** | 1. Người dùng chọn một con ngựa từ danh sách.<br>2. Hệ thống kiểm tra phạm vi xem.<br>3. Hệ thống lấy thông tin hồ sơ, phả hệ và chỉ số cơ thể.<br>4. Hệ thống loại bỏ các trường ngoài quyền.<br>5. Hệ thống tính "được tập" và "được đua" kèm lý do rồi hiển thị tab thông tin hồ sơ.<br>6. Người dùng mở các tab khác → hệ thống tải dữ liệu tương ứng từ Flow 2, Flow 3, Flow 5. |
| **Luồng thay thế** | A1. Người dùng bấm vào cha hoặc mẹ trên cây phả hệ → hệ thống mở hồ sơ của con đó nếu nằm trong phạm vi xem.<br>A2. CLUB MANAGER mở hồ sơ đã xóa → hệ thống hiện nhãn "Đã xóa", chỉ có nút "Khôi phục".<br>A3. Hồ sơ ở trạng thái Đã chuyển nhượng → hiển thị chỉ đọc. |
| **Luồng ngoại lệ** | E1. Con ngựa ngoài phạm vi xem → trả về 404.<br>E2. Không tải được dữ liệu của một tab → hiện lỗi riêng trong tab đó, các phần còn lại giữ nguyên. |

---

## F1.4 — Cập nhật hồ sơ ngựa (Sửa)

### Mô tả

Sửa thông tin định danh, ảnh đại diện, cha mẹ, chủ sở hữu và sở trường cự ly. Trạng thái sức khỏe do Flow 3 cập nhật, trạng thái vòng đời do F1.8 xử lý, khu và ô chuồng do F1.6 và F1.7 xử lý.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Được sửa những gì |
|---|---|---|---|
| CLUB MANAGER | Sửa | Toàn câu lạc bộ | Tên, giới tính, giống, màu lông, ngày sinh, số chip định danh, ảnh đại diện, cha, mẹ, chủ sở hữu. Không sửa sở trường cự ly |
| HEAD TRAINER | Sửa | Ngựa thuộc khu phụ trách | Chỉ sở trường cự ly, vì đây là đánh giá chuyên môn thuộc thẩm quyền huấn luyện viên |
| VETERINARIAN | Không | | Bác sĩ đổi trạng thái sức khỏe qua Flow 3 |
| GROOM | Không | | |
| HORSE OWNER | Không | | Tránh việc chủ ngựa tự sửa ngày sinh để lách điều kiện dự giải |

### Nghiệp vụ

1. Các quy tắc hợp lệ của F1.2 được áp dụng lại: số chip không trùng, ngày sinh trong khoảng 1 đến 40 tuổi, quy tắc chọn cha mẹ, định dạng và dung lượng ảnh. Ngày sinh chỉ bị kiểm lại khi giá trị thật sự đổi; hồ sơ cũ không đổi ngày sinh thì sửa các trường khác bình thường.
2. Không cho đổi giới tính nếu con ngựa đang được dùng làm cha hoặc mẹ của con khác mà giới tính mới làm sai vai trò. Chuyển từ MALE sang GELDING luôn được phép. Đổi ngày sinh của ngựa đang làm cha hoặc mẹ thì vẫn phải sinh trước con sớm nhất ít nhất 2 năm, tính cả con đã bị xóa hồ sơ (vì con đó có thể được khôi phục). *(BA chốt)*
3. Đổi cha hoặc mẹ phải kiểm tra lại vòng lặp phả hệ.
4. Chủ sở hữu (chỉ CLUB MANAGER):
   - Gán chủ: chỉ dùng cho ngựa chưa có chủ. Hệ thống mở giai đoạn sở hữu mới, bắt đầu từ lúc lưu.
   - Ngựa đã có chủ thì không đổi chủ bằng chức năng sửa hồ sơ (409), phải dùng chuyển nhượng nội bộ (mục 9). Không bỏ trống được chủ (400). Không gửi trường chủ sở hữu thì chủ giữ nguyên.
   - Hệ thống lưu lịch sử các giai đoạn sở hữu: chủ, thời điểm bắt đầu, thời điểm kết thúc, lý do, người ghi nhận. Thời điểm bắt đầu là lúc CLUB MANAGER lưu việc gán chủ hoặc chuyển chủ. Mỗi con ngựa có tối đa một giai đoạn đang mở.
   - Chủ mới thấy được toàn bộ lịch sử sức khỏe của con ngựa, nhưng chi phí y tế thuộc thời gian chủ khác sở hữu bị ẩn (Flow 3).
   - Chủ cũ mất quyền xem ngay khi việc chuyển chủ được lưu.
   - Việc gán chủ và chuyển chủ được ghi vào nhật ký: từ ai sang ai, ai thực hiện, thời điểm nào.
5. Không cho sửa hồ sơ của ngựa đã chuyển nhượng, đã mất hoặc hồ sơ đã xóa.
6. Khi HEAD TRAINER gửi kèm những trường ngoài quyền, hệ thống phải từ chối và báo lỗi, không âm thầm bỏ qua.
7. Nếu hai người cùng mở một hồ sơ và cùng bấm lưu, người lưu sau bị chặn và được thông báo dữ liệu vừa thay đổi kèm nội dung mới nhất. Không ghi đè âm thầm.
8. Ghi nhật ký thao tác đầy đủ giá trị trước và sau.
9. **Chuyển nhượng nội bộ** (bán cho chủ khác trong câu lạc bộ; chỉ CLUB MANAGER ghi nhận, sau khi hai bên đã thỏa thuận bên ngoài):
   - Nhập chủ mới và lý do (số hợp đồng, ngày ký nếu cần). Chủ mới bắt đầu sở hữu từ lúc lưu; hệ thống không nhận ngày hiệu lực lùi về trước. Không lưu giá bán vì đề tài không quản lý giao dịch tiền.
   - Chỉ cho ngựa Đang hoạt động hoặc Đã giải nghệ (409) và đang có chủ (409; chưa có chủ thì dùng gán chủ). Chủ mới phải khác chủ hiện tại (400) và là tài khoản HORSE OWNER đang hoạt động.
   - Bị chặn (409) nếu ngựa còn bệnh án đang mở; bác sĩ đóng bệnh án trước (Flow 3), để không có bệnh án nào nằm vắt qua hai chủ.
   - Không đổi vòng đời, khu, ô chuồng, GROOM, lớp học.
   - Đóng giai đoạn sở hữu hiện tại và mở giai đoạn mới tại cùng thời điểm lưu. Chi phí y tế chia theo thời điểm này (Flow 3).
   - Hai người cùng chuyển nhượng một con ngựa: người lưu sau bị chặn như mục 7.
   - Thông báo cho chủ mới ("Bạn đã trở thành chủ sở hữu ngựa X") và chủ cũ ("Ngựa X đã chuyển sang chủ khác").
10. **Xem lịch sử sở hữu:** mới nhất lên trên, gồm chủ, thời điểm bắt đầu, thời điểm kết thúc, lý do và người ghi nhận. CLUB MANAGER, HEAD TRAINER, VETERINARIAN, GROOM xem toàn bộ; HORSE OWNER chỉ thấy các giai đoạn của chính mình.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-04 |
| **Tên use case** | Cập nhật hồ sơ ngựa |
| **Actor chính** | CLUB MANAGER, HEAD TRAINER |
| **Actor phụ** | Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | Người dùng đã đăng nhập. HEAD TRAINER chỉ thao tác với ngựa thuộc khu mình phụ trách. Hồ sơ không ở trạng thái Đã chuyển nhượng hay Đã mất và chưa bị xóa. |
| **Hậu điều kiện** | Thông tin được cập nhật. Nhật ký ghi lại giá trị trước và sau. |
| **Luồng sự kiện chính** | 1. Người dùng mở hồ sơ và chọn "Chỉnh sửa".<br>2. Hệ thống hiển thị biểu mẫu chỉ gồm các trường người dùng được sửa.<br>3. Người dùng sửa thông tin.<br>4. Người dùng gửi biểu mẫu.<br>5. Hệ thống kiểm tra điều kiện hợp lệ và kiểm tra phiên bản dữ liệu.<br>6. Hệ thống lưu, ghi nhật ký và hiển thị lại hồ sơ. |
| **Luồng thay thế** | A1. CLUB MANAGER gán chủ cho ngựa chưa có chủ → chọn tài khoản chủ. Ngựa đã có chủ → dùng chuyển nhượng nội bộ (mục 9).<br>A1b. CLUB MANAGER ghi nhận chuyển nhượng nội bộ → nhập chủ mới và lý do; hệ thống báo cho hai chủ.<br>A2. CLUB MANAGER đổi ảnh đại diện → ảnh cũ bị thay thế.<br>A3. HEAD TRAINER chỉ sửa sở trường cự ly sau khi đánh giá chuyên môn. |
| **Luồng ngoại lệ** | E1. Số chip định danh trùng → báo lỗi.<br>E2. Đổi giới tính làm sai vai trò cha hoặc mẹ của con khác → chặn và giải thích.<br>E3. Cha hoặc mẹ mới tạo vòng lặp phả hệ → chặn.<br>E3b. Đổi chủ của ngựa đã có chủ bằng sửa hồ sơ → chặn (409), hướng dẫn dùng chuyển nhượng nội bộ. Chuyển nhượng khi còn bệnh án mở → chặn (409).<br>E4. Người khác vừa lưu trước → chặn (409); giao diện tải lại hồ sơ để hiện dữ liệu mới nhất.<br>E5. Gửi trường có trong biểu mẫu nhưng ngoài quyền của vai trò (ví dụ HEAD TRAINER gửi tên ngựa) → 403. Gửi trường không thuộc biểu mẫu sửa (ví dụ trạng thái sức khỏe, vòng đời, khu chuồng) → 400. *(theo RFC 9110: 403 là thiếu quyền, 400 là yêu cầu sai hình dạng)* |

---

## F1.5 — Ghi nhận chỉ số cơ thể (Thêm, Xóa, Xem)

### Mô tả

Ghi lại các phép đo định kỳ của con ngựa: cân nặng, chiều cao, điểm thể trạng và thân nhiệt. Đây là nơi lưu chung của toàn hệ thống. Flow 3 ghi số đo vào đây khi bác sĩ khám, Flow 4 đọc điểm thể trạng để tính khẩu phần.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Không ghi số đo, vì đây là công việc chuyên môn. |
| HEAD TRAINER | Thêm, Xem | Ngựa thuộc khu phụ trách | Ghi được cả bốn loại chỉ số. |
| VETERINARIAN | Thêm, Xóa, Xem | Toàn câu lạc bộ | Vai trò duy nhất được xóa bản ghi sai. |
| GROOM | Thêm, Xem | Ngựa được phân công | Ghi được cả bốn loại chỉ số. |
| HORSE OWNER | Xem | Ngựa sở hữu | |

### Nghiệp vụ

1. Bốn loại chỉ số và khoảng bình thường:
   - Cân nặng: 400 đến 600 kg.
   - Chiều cao: 150 đến 175 cm.
   - Điểm thể trạng: 4 đến 6 trên thang 1 đến 9.
   - Thân nhiệt: 37.2 đến 38.3 độ C.
2. Giá trị ngoài khoảng bình thường vẫn lưu được nhưng hệ thống hỏi xác nhận lại trước khi lưu và đánh dấu bản ghi là bất thường.
3. Thời điểm đo không được ở tương lai. Cho phép nhập lùi tối đa 7 ngày.
4. Bản ghi đo không được sửa. Ghi sai thì VETERINARIAN xóa (bắt buộc nhập lý do) rồi đo lại. Mục đích là bảo vệ tính trung thực của dữ liệu.
5. Mỗi bản ghi lưu kèm nguồn: nhập tay tại F1.5 hoặc ghi từ một buổi khám của Flow 3. Bản ghi có nguồn từ buổi khám không xóa được ở đây, phải xử lý bên Flow 3.
6. Cảnh báo tự động:
   - Thân nhiệt trên 38.6 độ C: thông báo khẩn cho VETERINARIAN và HEAD TRAINER phụ trách khu.
   - Cân nặng giảm quá 5% trong 14 ngày: thông báo cho VETERINARIAN và HEAD TRAINER phụ trách khu.
7. Không ghi chỉ số cho ngựa đã chuyển nhượng hoặc hồ sơ đã xóa. Riêng VETERINARIAN vẫn xóa được bản ghi đo sai của ngựa đã chuyển nhượng (bắt buộc lý do, ghi nhật ký). *(BA chốt)*
8. Ghi nhật ký cho thao tác thêm và xóa.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-05 |
| **Tên use case** | Ghi nhận chỉ số cơ thể |
| **Actor chính** | HEAD TRAINER, VETERINARIAN, GROOM |
| **Actor phụ** | Hệ thống (sinh cảnh báo, ghi nhật ký) |
| **Tiền điều kiện** | Người dùng đã đăng nhập. Con ngựa nằm trong phạm vi thao tác của người dùng và đang ở trạng thái Đang hoạt động hoặc Đã giải nghệ. |
| **Hậu điều kiện** | Bản ghi đo được lưu và hiện trên biểu đồ. Nếu chạm ngưỡng cảnh báo thì thông báo được gửi đi. |
| **Luồng sự kiện chính** | 1. Người dùng mở hồ sơ ngựa và chọn phần chỉ số cơ thể.<br>2. Người dùng chọn "Ghi chỉ số".<br>3. Người dùng chọn loại chỉ số, nhập giá trị và thời điểm đo.<br>4. Người dùng gửi.<br>5. Hệ thống kiểm tra thời điểm đo và khoảng giá trị.<br>6. Hệ thống lưu bản ghi, đánh dấu bất thường nếu ngoài khoảng bình thường và vẽ lại biểu đồ.<br>7. Hệ thống sinh cảnh báo nếu chạm ngưỡng. |
| **Luồng thay thế** | A1. Người dùng ghi nhiều loại chỉ số trong cùng một lần đo.<br>A2. VETERINARIAN phát hiện bản ghi sai → xóa kèm lý do rồi đo lại.<br>A3. Số đo đến từ một buổi khám của Flow 3 → hệ thống tự ghi vào đây kèm nguồn, không gửi cảnh báo sốt / sụt cân vì bác sĩ đang khám (Flow 3 mục III.5.4, BA chốt). |
| **Luồng ngoại lệ** | E1. Thời điểm đo ở tương lai hoặc lùi quá 7 ngày → báo lỗi.<br>E2. GROOM ghi chỉ số cho ngựa không được phân công → trả về 403.<br>E3. Giá trị ngoài khoảng bình thường → hệ thống hỏi xác nhận, người dùng hủy thì không lưu. |

---

## F1.6 — Xếp khu chuồng cho ngựa (Sửa, Xem)

### Mô tả

CLUB MANAGER quyết định con ngựa thuộc khu chuồng nào. Khu chuồng quyết định HEAD TRAINER nào phụ trách con ngựa đó, nên đây là bước bắt buộc trước khi xếp ô và phân công GROOM.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Sửa, Xem | Toàn câu lạc bộ | Vai trò duy nhất xếp khu và đổi khu cho ngựa. |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Nhận thông báo khi có ngựa mới vào khu mình phụ trách. |
| VETERINARIAN | Xem | Toàn câu lạc bộ | Đề xuất đổi khu bằng ghi chú y tế. |
| GROOM | Xem | Toàn câu lạc bộ | |
| HORSE OWNER | Xem | Ngựa sở hữu | Chỉ thấy tên khu, không thấy sơ đồ chuồng trại. |

### Nghiệp vụ

1. Danh mục khu chuồng, danh mục ô chuồng và việc gán HEAD TRAINER phụ trách khu do Flow 2 quản lý. Flow 1 chỉ sử dụng, không tạo.
2. Chỉ chọn được khu đang hoạt động, có HEAD TRAINER đang hoạt động phụ trách, và còn chỗ nhận ngựa. Số chỗ còn nhận = số ô trống − số ngựa của khu đang chờ xếp ô (ví dụ khu có 2 ô trống nhưng đã có 2 ngựa chờ xếp ô thì hết chỗ). *(BA chốt)*
3. Ngựa chưa được xếp khu nằm trong danh sách "Chờ xếp khu" của CLUB MANAGER. Trong thời gian này không HEAD TRAINER nào thao tác được với con ngựa đó.
4. Hệ quả khi đổi khu:
   - Ô chuồng cũ được trả về trạng thái trống.
   - Ngựa chuyển sang danh sách "Chờ xếp ô" của HEAD TRAINER khu mới.
   - Phân công GROOM giữ nguyên, vì GROOM gắn với con ngựa chứ không gắn với khu.
   - Ngựa bị rút khỏi mọi lớp đang học không do HEAD TRAINER khu mới phụ trách (lớp của HEAD TRAINER khu cũ, của HEAD TRAINER khác hoặc lớp chưa có HEAD TRAINER). Khu mới cùng HEAD TRAINER với khu cũ thì giữ nguyên lớp. *(BA chốt)* Các buổi chưa diễn ra biến mất khỏi lịch của con ngựa, các buổi đã học giữ nguyên lịch sử.
   - HEAD TRAINER khu mới nhận thông báo và đăng ký lớp lại nếu cần.
5. Chỉ xếp khu và đổi khu cho ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. Ngựa đã chuyển nhượng hoặc hồ sơ đã xóa thì không thao tác được.
6. Bắt buộc nhập lý do khi đổi khu (ngựa đã có khu). Xếp khu lần đầu (ngựa đang Chờ xếp khu) không bắt lý do. Ghi nhật ký thao tác. *(BA chốt)*

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-06 |
| **Tên use case** | Xếp khu chuồng cho ngựa |
| **Actor chính** | CLUB MANAGER |
| **Actor phụ** | HEAD TRAINER (nhận thông báo), Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | CLUB MANAGER đã đăng nhập. Có ít nhất một khu còn nhận được ngựa (mục 2). Ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. |
| **Hậu điều kiện** | Ngựa thuộc khu mới và nằm trong danh sách "Chờ xếp ô" của HEAD TRAINER khu đó. Ô chuồng cũ (nếu có) được trả về trống. |
| **Luồng sự kiện chính** | 1. CLUB MANAGER mở hồ sơ ngựa hoặc danh sách "Chờ xếp khu".<br>2. CLUB MANAGER chọn "Xếp khu chuồng".<br>3. Hệ thống hiển thị danh sách khu kèm HEAD TRAINER phụ trách và số ô trống.<br>4. CLUB MANAGER chọn khu và nhập lý do.<br>5. Hệ thống kiểm tra khu hợp lệ.<br>6. Hệ thống cập nhật khu, trả ô cũ về trống và rút ngựa khỏi các lớp của HEAD TRAINER khu cũ.<br>7. Hệ thống ghi nhật ký và thông báo cho HEAD TRAINER khu mới. |
| **Luồng thay thế** | A1. Khu được chọn ngay lúc tạo hồ sơ tại F1.2.<br>A2. Ngựa đang có ô chuồng ở khu cũ → hệ thống hiện bảng liệt kê hệ quả để CLUB MANAGER xác nhận trước khi lưu. |
| **Luồng ngoại lệ** | E1. Khu chưa có HEAD TRAINER phụ trách hoặc đã hết ô trống → không chọn được, hệ thống giải thích lý do.<br>E2. Khu vừa bị lấp đầy bởi thao tác khác → tải lại danh sách khu.<br>E3. Ngựa đã chuyển nhượng hoặc hồ sơ đã xóa → không hiện nút thao tác. |

---

## F1.7 — Xếp ô chuồng và phân công Groom (Sửa, Xem)

### Mô tả

HEAD TRAINER xếp con ngựa thuộc khu mình vào một ô chuồng cụ thể và chỉ định GROOM phụ trách chăm sóc hằng ngày.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Không xếp ô và không phân công GROOM, vì đây là việc điều hành chuyên môn trong khu. |
| HEAD TRAINER | Sửa, Xem | Ngựa thuộc khu phụ trách | Xếp ô, chuyển ô trong khu, gỡ ngựa khỏi ô, phân công và đổi GROOM. |
| VETERINARIAN | Xem | Toàn câu lạc bộ | Cần tách ngựa khỏi đàn thì yêu cầu HEAD TRAINER chuyển ô, kèm ghi chú y tế của Flow 3. |
| GROOM | Xem | Toàn câu lạc bộ | Xem vị trí ngựa trên sơ đồ chuồng trại. |
| HORSE OWNER | Xem | Ngựa sở hữu | Chỉ thấy tên khu và mã ô, không thấy sơ đồ. |

### Nghiệp vụ

1. Một ô chuồng chỉ chứa một con ngựa, một con ngựa chỉ ở một ô (ràng buộc cơ sở dữ liệu).
2. Chỉ xếp ngựa vào ô thuộc đúng khu chuồng mà CLUB MANAGER đã chọn cho con ngựa đó.
3. HEAD TRAINER chỉ thao tác với ngựa thuộc khu mình phụ trách. Ngựa chưa được xếp khu thì không thao tác được và hệ thống hướng dẫn liên hệ CLUB MANAGER.
4. GROOM được phân công theo con ngựa, không theo ô hay theo khu. Một GROOM có thể phụ trách nhiều ngựa ở nhiều khu khác nhau.
5. Màn hình chọn GROOM hiển thị kèm tổng số ngựa mà mỗi GROOM đang phụ trách trên toàn câu lạc bộ, để HEAD TRAINER thấy được khối lượng công việc trước khi giao thêm. Hệ thống không chặn, quyền quyết định thuộc về HEAD TRAINER.
   - Chỉ giao hoặc đổi GROOM được khi khu của ngựa đang hoạt động; GROOM được giao phải là tài khoản GROOM đang hoạt động. *(BA chốt)*
   - Không có thao tác "gỡ GROOM mà không giao ai": HEAD TRAINER chỉ giao hoặc đổi GROOM, nên ngựa luôn có GROOM phụ trách. GROOM chỉ tự kết thúc khi ngựa chuyển nhượng (F1.8). *(BA chốt)*
6. Hệ quả khi đổi GROOM:
   - GROOM cũ mất quyền thao tác trên con ngựa đó nhưng vẫn xem được hồ sơ như mọi vai trò khác.
   - Phần công việc trong ngày chưa hoàn thành và các đầu việc buổi tập trong tương lai chuyển sang GROOM mới.
   - Công việc đã hoàn thành giữ nguyên tên người đã làm.
   - Nếu GROOM mới đã có checklist cùng ngày cho con ngựa này (ví dụ đổi A → B → A trong một ngày) thì hệ thống báo lỗi, không tự gộp hay xóa việc. *(BA chốt)*
7. Chuyển ô trong cùng một khu không ảnh hưởng tới GROOM, lớp học hay lịch tập.
8. Ngựa đã giải nghệ vẫn giữ ô chuồng và GROOM phụ trách, vì vẫn được chăm sóc và chữa bệnh.
9. Ghi nhật ký thao tác.
10. HEAD TRAINER gỡ được ngựa khỏi ô (ví dụ khi cần sửa ô); ngựa quay lại danh sách "Chờ xếp ô" của khu, GROOM giữ nguyên. *(BA chốt)*

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-07 |
| **Tên use case** | Xếp ô chuồng và phân công Groom |
| **Actor chính** | HEAD TRAINER |
| **Actor phụ** | GROOM (nhận thông báo), Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | HEAD TRAINER đã đăng nhập. Con ngựa đã được CLUB MANAGER xếp vào khu mà HEAD TRAINER này phụ trách. Khu còn ô trống. |
| **Hậu điều kiện** | Con ngựa nằm ở một ô chuồng cụ thể và có GROOM phụ trách. Các đầu việc chăm sóc được gắn cho GROOM đó. |
| **Luồng sự kiện chính** | 1. HEAD TRAINER mở danh sách "Chờ xếp ô" của khu mình.<br>2. HEAD TRAINER chọn con ngựa.<br>3. Hệ thống hiển thị sơ đồ các ô trống của khu.<br>4. HEAD TRAINER chọn ô.<br>5. HEAD TRAINER chọn GROOM phụ trách, có xem số ngựa mỗi GROOM đang phụ trách.<br>6. HEAD TRAINER gửi.<br>7. Hệ thống kiểm tra ô còn trống và thuộc đúng khu.<br>8. Hệ thống lưu, chuyển đầu việc cho GROOM mới và ghi nhật ký. |
| **Luồng thay thế** | A1. Chỉ chuyển ô trong cùng khu, giữ nguyên GROOM.<br>A2. Chỉ đổi GROOM, giữ nguyên ô.<br>A3. VETERINARIAN yêu cầu tách ngựa nghi nhiễm bệnh → HEAD TRAINER chuyển sang một ô trống cách xa đàn. |
| **Luồng ngoại lệ** | E1. Ô vừa bị con khác chiếm → tải lại sơ đồ ô trống.<br>E2. HEAD TRAINER thao tác với ngựa ngoài khu phụ trách → trả về 403.<br>E3. Con ngựa chưa được xếp khu → không thao tác được, hệ thống hướng dẫn liên hệ CLUB MANAGER.<br>E4. Khu đã hết ô trống → báo lỗi và gợi ý đề nghị CLUB MANAGER đổi khu. |

---

## F1.8 — Thay đổi trạng thái vòng đời và xóa hồ sơ (Sửa, Xóa)

### Mô tả

Chuyển ngựa sang Đã giải nghệ, Đã chuyển nhượng hoặc Đã mất, kích hoạt lại ngựa quay về câu lạc bộ, và xóa mềm hồ sơ tạo nhầm.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Sửa, Xóa | Toàn câu lạc bộ | Bắt buộc nhập lý do cho mọi thao tác. |
| HEAD TRAINER | Không | | Chỉ đề xuất bằng ghi chú. |
| VETERINARIAN | Ghi nhận ngựa mất | Ngựa đang có bệnh án mở | Chỉ ghi nhận mất cùng lúc đóng bệnh án (F3.9). Các thao tác khác chỉ khuyến nghị về mặt y tế. |
| GROOM | Không | | |
| HORSE OWNER | Không | | Yêu cầu câu lạc bộ thực hiện. |

### Nghiệp vụ

1. **Giải nghệ (ACTIVE sang RETIRED):**
   - Rút ngựa khỏi các lớp đang học. Các buổi chưa diễn ra biến mất khỏi lịch, các buổi đã học giữ nguyên lịch sử.
   - Hủy các đăng ký thi đấu chưa diễn ra.
   - Giữ nguyên khu chuồng, ô chuồng, GROOM phụ trách, chế độ chăm sóc và y tế.
2. **Chuyển nhượng (ACTIVE hoặc RETIRED sang TRANSFERRED):**
   - Làm hết phần của giải nghệ nếu ngựa đang ở trạng thái Đang hoạt động.
   - Trả ô chuồng về trống, bỏ khu chuồng, kết thúc phân công GROOM.
   - Lệnh khóa huấn luyện (nếu có) tự động gỡ, ghi rõ lý do "Gỡ do chuyển nhượng".
   - Bị chặn (409) nếu con ngựa còn bệnh án đang mở; bác sĩ phải đóng bệnh án trước (Flow 3).
   - Yêu cầu khám đang chờ tự chuyển "Đã bỏ qua" với lý do "Do chuyển nhượng"; lịch hẹn khám định kỳ và lịch chăm sóc chưa làm tự hủy (Flow 3).
   - Giữ nguyên chủ sở hữu trên hồ sơ để chủ cũ vẫn tra cứu được, hồ sơ chuyển sang chế độ chỉ đọc và có nhãn "Đã chuyển nhượng".
   - GROOM vừa bị kết thúc phân công nhận thông báo "Ngựa X đã chuyển nhượng, bạn không còn phụ trách".
2b. **Ghi nhận ngựa mất (ACTIVE hoặc RETIRED sang DECEASED):**
   - Bắt buộc nhập ngày mất (không ở tương lai, không trước ngày sinh nếu biết) và nguyên nhân (dùng ô lý do). Không nhập ngày mất khi chuyển sang trạng thái khác.
   - Bị chặn (409) nếu con ngựa còn bệnh án đang mở; bác sĩ đóng bệnh án với kết luận và chi phí thật trước (Flow 3). Hệ thống không tự đóng bệnh án.
   - Ngựa mất trong lúc điều trị: VETERINARIAN đóng bệnh án kèm ngày mất (F3.9). Hệ thống đóng bệnh án rồi ghi nhận ngựa mất trong cùng một thao tác, lấy kết luận cuối của bệnh án làm nguyên nhân mất. CLUB MANAGER không phải làm thêm bước nào.
   - Làm như chuyển nhượng: rút khỏi lớp, rút đăng ký thi đấu chưa diễn ra, trả ô, bỏ khu, kết thúc phân công GROOM, gỡ lệnh khóa huấn luyện với lý do "Gỡ do ngựa mất", yêu cầu khám đang chờ và lịch chưa làm tự hủy với lý do "Do ngựa mất". Không đặt lại trạng thái sức khỏe.
   - Giữ chủ sở hữu, chủ vẫn xem được hồ sơ. Hồ sơ chỉ đọc. Ngựa vẫn hiện là cha mẹ trong phả hệ và vẫn chọn làm cha mẹ được. Số chip vẫn giữ chỗ.
   - Đã mất là trạng thái cuối: không kích hoạt lại, không đổi sang trạng thái khác, không xóa hồ sơ.
   - Thông báo "Ngựa X đã mất" (kèm ngày mất và nguyên nhân) cho chủ ngựa nếu còn hoạt động, HEAD TRAINER của khu cũ, GROOM cũ và mọi CLUB MANAGER đang hoạt động (kể cả người vừa ghi nhận). Áp dụng cho cả hai luồng: CLUB MANAGER ghi nhận và VETERINARIAN ghi nhận khi đóng bệnh án. GROOM không nhận thêm thông báo "đã chuyển nhượng".
3. **Kích hoạt lại (RETIRED hoặc TRANSFERRED quay về ACTIVE):**
   - Dùng cho trường hợp ngựa quay lại tập luyện hoặc câu lạc bộ mua lại con ngựa đã bán. Luôn kích hoạt lại hồ sơ cũ, không tạo hồ sơ mới, vì số chip định danh gắn với con vật ngoài đời thật và mọi dữ liệu lịch sử, phả hệ đang gắn với hồ sơ này.
   - Toàn bộ dữ liệu cũ được giữ nguyên: bệnh án, chỉ số cơ thể, thành tích, phả hệ, số chip định danh.
   - Lớp học và đăng ký thi đấu đã hủy không tự khôi phục.
   - Nếu kích hoạt lại từ Đã chuyển nhượng: CLUB MANAGER phải xếp lại khu (F1.6), HEAD TRAINER xếp lại ô và GROOM (F1.7). Chủ mới khác chủ cũ thì dùng chuyển nhượng nội bộ (F1.4 mục 9). Nếu chủ cũ không còn là tài khoản HORSE OWNER đang hoạt động thì hệ thống bỏ trống chủ và đóng giai đoạn sở hữu của chủ cũ; bảng xác nhận báo trước "sẽ bỏ trống chủ X", sau đó gán chủ bằng F1.4. *(BA chốt)*
   - Kích hoạt lại từ Đã chuyển nhượng: trạng thái sức khỏe được đặt về "Cần theo dõi" cho tới khi bác sĩ khám lại, vì dữ liệu sức khỏe trong thời gian ngựa ở ngoài câu lạc bộ không còn đáng tin. Kích hoạt lại từ Đã giải nghệ: giữ nguyên trạng thái sức khỏe, vì ngựa vẫn ở câu lạc bộ và vẫn được khám định kỳ. *(BA chốt)*
4. **Xóa hồ sơ (xóa mềm):**
   - Chỉ dành cho hồ sơ vừa tạo nhầm và chưa dùng vào việc gì.
   - Bị chặn nếu con ngựa đã phát sinh bất kỳ dữ liệu nghiệp vụ nào: bệnh án, buổi khám, yêu cầu khám, lịch chăm sóc y tế, lệnh khóa huấn luyện, chỉ số cơ thể, xếp ô chuồng, phân công GROOM, lớp học, đăng ký thi đấu, ngưỡng hiệu suất, khẩu phần ăn, checklist hằng ngày, báo cáo sự cố. Cũng bị chặn nếu con ngựa đang là cha hoặc mẹ của con khác, đã chuyển nhượng hoặc đã mất. *(BA chốt)*
   - Hồ sơ bị ẩn khỏi mọi vai trò trừ CLUB MANAGER. Số chip định danh vẫn bị coi là đã sử dụng.
   - Dữ liệu lịch sử và nhật ký thao tác không bao giờ bị xóa theo.
   - CLUB MANAGER khôi phục được hồ sơ đã xóa, hồ sơ trở về trạng thái trước khi xóa. Riêng khu chuồng: khôi phục luôn bỏ khu, ngựa vào danh sách "Chờ xếp khu", bất kể khu cũ còn chỗ hay không, vì khi xóa hồ sơ chỗ của ngựa trong khu đã được nhả cho ngựa khác. Trước khi khôi phục, hệ thống hiện bảng xem trước hệ quả (bỏ khu, bỏ trống chủ nếu có). *(BA chốt)* Riêng chủ sở hữu: nếu chủ cũ không còn là tài khoản HORSE OWNER đang hoạt động thì bỏ trống chủ và đóng giai đoạn sở hữu của chủ cũ, CLUB MANAGER chọn chủ mới sau. *(BA chốt)*
   - Hồ sơ đã xóa không đổi vòng đời được, kể cả mở bảng xem trước hệ quả; CLUB MANAGER phải khôi phục hồ sơ trước. *(BA chốt)*
5. Mọi thao tác trong chức năng này bắt buộc nhập lý do, phải hiện bảng liệt kê hệ quả để xác nhận trước khi thực hiện, và phải thành công hoặc thất bại cùng nhau (Atomic).
6. Ghi nhật ký thao tác kèm lý do.
7. Buổi tập đang diễn ra lúc ngựa giải nghệ, chuyển nhượng hoặc mất: giữ lại buổi đó, chỉ hủy các buổi chưa diễn ra. *(BA chốt)*

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-08 |
| **Tên use case** | Thay đổi trạng thái vòng đời và xóa hồ sơ |
| **Actor chính** | CLUB MANAGER; VETERINARIAN (chỉ ghi nhận ngựa mất khi đóng bệnh án) |
| **Actor phụ** | Hệ thống (ghi nhật ký, xử lý dữ liệu liên quan) |
| **Tiền điều kiện** | CLUB MANAGER đã đăng nhập. Hồ sơ ngựa tồn tại trong hệ thống. |
| **Hậu điều kiện** | Trạng thái vòng đời được thay đổi hoặc hồ sơ bị ẩn. Các dữ liệu liên quan được xử lý theo quy tắc. Nhật ký ghi lại lý do. |
| **Luồng sự kiện chính** | 1. CLUB MANAGER mở hồ sơ và chọn "Đổi trạng thái vòng đời".<br>2. Hệ thống hiển thị các trạng thái có thể chuyển sang kèm mô tả hệ quả.<br>3. CLUB MANAGER chọn trạng thái và nhập lý do.<br>4. Hệ thống hiển thị bảng xác nhận liệt kê toàn bộ hệ quả.<br>5. CLUB MANAGER xác nhận.<br>6. Hệ thống thực hiện trong một giao dịch và ghi nhật ký. |
| **Luồng thay thế** | A1. CLUB MANAGER chọn "Xóa hồ sơ" với hồ sơ tạo nhầm → hệ thống kiểm tra điều kiện xóa trước khi thực hiện.<br>A2. CLUB MANAGER khôi phục hồ sơ đã xóa → hồ sơ trở về trạng thái trước khi xóa.<br>A3. Câu lạc bộ mua lại ngựa đã bán → CLUB MANAGER kích hoạt lại hồ sơ cũ, hệ thống đặt sức khỏe về "Cần theo dõi" và đưa ngựa vào danh sách "Chờ xếp khu".<br>A4. Ngựa chết → CLUB MANAGER ghi nhận Đã mất kèm ngày mất và nguyên nhân.<br>A5. Ngựa mất khi đang có bệnh án mở → VETERINARIAN đóng bệnh án kèm ngày mất tại F3.9, hệ thống ghi nhận Đã mất cùng lúc. |
| **Luồng ngoại lệ** | E1. Hồ sơ đã phát sinh dữ liệu nghiệp vụ → không cho xóa, hệ thống liệt kê các dữ liệu đang vướng.<br>E2. Con ngựa đang là cha hoặc mẹ của con khác → không cho xóa.<br>E3. Không nhập lý do → chặn thao tác.<br>E3b. Ghi nhận ngựa mất khi còn bệnh án đang mở → chặn (409). Thiếu ngày mất, ngày mất ở tương lai hoặc trước ngày sinh → báo lỗi tại ô ngày mất. Thao tác trên ngựa đã mất → chặn (409).<br>E4. Thực hiện thất bại giữa chừng → hủy toàn bộ, giữ nguyên trạng thái cũ. |

---

## Phụ lục 1b: Danh mục khu và ô chuồng (dùng chung với Flow 2)

Chỉ CLUB MANAGER tạo, sửa, xóa khu và ô. Flow 1 dựa vào danh mục này để xếp khu (F1.6) và xếp ô (F1.7). *(BA chốt)*

1. Ô mới tạo luôn ở trạng thái Trống. Người dùng chỉ đổi được Trống ⇄ Bảo trì, và chỉ khi ô không có ngựa. "Đang có ngựa" và "Trống" do việc xếp và gỡ ngựa tự đổi. Không có trạng thái "Đặt trước".
2. Khu còn ngựa thì không được chuyển sang Đóng hoặc Bảo trì, không được gỡ HEAD TRAINER phụ trách, không được xóa. Muốn làm thì chuyển ngựa sang khu khác trước. Khu còn ô cũng không xóa được.
3. Sức chứa là số ô tối đa của khu. Không hạ sức chứa xuống dưới số ô đang có (áp cho mọi khu, còn ngựa hay không); muốn hạ thì xóa bớt ô trước. Khu đã đủ sức chứa thì không tạo thêm ô.
4. Ô đang có ngựa không xóa được và không chuyển sang khu khác được.
5. Không đổi ô trống sang Bảo trì, không chuyển ô trống sang khu khác và không xóa ô trống nếu việc đó làm khu thiếu ô cho ngựa đang "Chờ xếp ô".
6. Thêm, sửa, xóa khu và ô đều ghi nhật ký.
7. Đổi HEAD TRAINER phụ trách của khu không rút ngựa trong khu khỏi lớp của HEAD TRAINER cũ (khác với đổi khu cho từng con ở F1.6). *(BA chốt)*

## Phụ lục 2: Việc còn nợ khi triển khai

Phần này để team theo dõi việc còn lại, không phải nội dung đặc tả.

Theo dõi chi tiết từng task: https://claude.ai/artifact/LBQGJP8TdKxQjzydHfPryJ.

### 1. Việc chờ Flow 2 làm mô hình "lớp học": đã xong

Flow 2 đã có lớp học nhiều ngựa (`training_classes`, `horse_enrollments`, `session_participants`). Cả 5 việc đã làm; module horses và stable không còn tự ghi bảng của training mà gọi hàm do training export (`TrainingOperationsFacade`), chạy chung transaction.

| # | Việc | Docs | Cách làm |
|---|---|---|---|
| 1 | Training export hàm rút ngựa khỏi lớp | F1.6 mục 4, F1.8 mục 1 | `withdrawHorseFromClasses`: enrollment ACTIVE → LEFT (chưa bắt đầu học thì CANCELLED); hủy lượt tập PLANNED/PRESENT/READY của buổi từ lúc rút trở đi; buổi đã học và lượt ONGOING giữ nguyên. `leave()` (HT bấm rời lớp) dùng chung phần hủy lượt |
| 2 | Đổi khu thì rút ngựa khỏi lớp của Head Trainer khu cũ | F1.6 mục 4, use case bước 6 | `assignBarn` gọi hàm ở việc 1, lọc theo HT khu cũ. Khu mới cùng HT với khu cũ thì giữ lớp (quyết định, `headTrainerToLeaveOnBarnChange`) |
| 3 | Giải nghệ / chuyển nhượng thì rút ngựa khỏi lớp | F1.8 mục 1, 2 | `updateLifecycle` (cờ `withdrawFromClasses`) gọi hàm ở việc 1; bỏ `cancelOpenTrainingPlans` |
| 4 | Đổi Groom thì chuyển đầu việc buổi tập tương lai sang Groom mới | F1.7 mục 6 | `moveFutureParticipantsToGroom`: chỉ chuyển lượt đang giao cho Groom cũ; lượt HT đã giao tay cho người khác giữ nguyên (quyết định) |
| 5 | Câu tóm tắt nói "lớp" thay cho "giáo án" | BA ví dụ "Winx đang có 2 lớp…" | Đếm số lớp đang học (`activeClasses`); API trả `classesWithdrawn` thay cho `trainingPlansCancelled` |

Phát hiện khi làm, cũng đã sửa: chặn xóa hồ sơ (F1.8) đang hỏi `training_plans.horse_id`, cột này Flow 2 đã đổi thành `legacy_horse_id` nên xóa hồ sơ lỗi 500. Đã đổi sang kiểm `horse_enrollments` (nhãn "lớp học").

### 1b. Còn lại sau khi có mô hình lớp học

- ~~Tab Huấn luyện ở hồ sơ ngựa (F1.3)~~ Đã làm, thay cho `GET /horses/:id/training-plans` Flow 2 đã bỏ: `GET /horses/:horseId/training/classes` (lớp đang học và đã rời) và `GET /horses/:horseId/training/sessions` (lịch buổi có phân trang, lọc `classId`, `when=upcoming|history`, kèm kết quả time trial). CM, HT, VET, OWNER xem; GROOM 403; ngoài phạm vi 404.
- ~~Nhận xét sau buổi tập (F1.3)~~ Đã làm: mỗi buổi trong `GET /horses/:horseId/training/sessions` có `evaluation { score, comment, evaluatorName, createdAt }` hoặc `null`.
- ~~Giao Groom lần đầu~~ Đã làm: giao hoặc đổi Groom (`PUT /horses/:id/groom`) điền Groom mới vào các lượt tập tương lai chưa ai dắt, cùng với lượt của Groom cũ; lượt HT đã giao tay cho người khác giữ nguyên.
- **Khóa huấn luyện và lượt tập đã xếp** (đã chốt, Q2 ở Phụ lục 2 Flow 3; áp dụng cả khi sức khỏe chuyển Chấn thương / Cách ly): đặt khóa **không** hủy lượt tập đã xếp. Ngựa bị chặn lúc publish buổi và lúc bắt đầu/điểm danh (Flow 2 đánh `CANCELLED_BY_LOCK`); gỡ khóa trước giờ tập thì ngựa tập bình thường. Lý do: khóa là tạm thời, hủy sớm không khôi phục được lượt (có khi mất cả buổi). `cancelFutureParticipationsByTrainingLock` và `assertNoOngoingParticipant` chưa có nơi gọi, giữ lại chưa dùng. Danh sách lượt tập (`GET /training-sessions/:sessionId/participants`) có cờ `trainingLocked` tính lúc đọc để FE hiện nhãn "Đang bị khóa" trước giờ tập.
- **Cần theo dõi chỉ tập Nhẹ và Trung bình (III.4) chưa chặn được**: mô hình lớp của Flow 2 không còn cường độ buổi tập (cột `training_sessions.intensity` cũ không còn dùng), nên ngựa Cần theo dõi đang tập được mọi buổi. Giữ luật của Flow 1; chờ Flow 2 và BA chốt cách thêm cường độ (Q1 ở Phụ lục 2 Flow 3).
- ~~Đánh giá buổi tập bị bỏ~~ Sai, đính chính: chức năng vẫn có ở nhánh Flow 2, chỉ bị merge làm rơi; đã gộp lại, tab hiệu suất đọc lại được đánh giá mới nhất.
- ~~Lỗi schema của Flow 2~~ Đã sửa (migration `RelaxLegacyTrainingColumns`): bỏ `NOT NULL` cho 8 cột cũ, giữ dữ liệu; đã lưu thử giáo án, buổi tập, time trial, chỉ số, đánh giá trên DB migrate mới. Cùng đợt: buổi bị rút hết ngựa chuyển `CANCELLED` (không còn `COMPLETED`), khóa huấn luyện hủy lượt từ đúng thời điểm khóa (`>=`).

### 1c. Rà đặc tả Flow 1 với code

Đối chiếu khoảng 205 luật của F1.1–F1.8 và mục III với code; khoảng 189 luật đã đúng. Đã sửa:

- Đổi sức khỏe ghi nhật ký (III.6.1).
- Kiểm quyền trước, kiểm trạng thái sau (III.6.3): sửa hồ sơ, ghi chỉ số, giao Groom. Người ngoài phạm vi nhận 403 trước 409.
- Khu không hoạt động và Groom không còn hoạt động trả 409 thay vì 400 (III.6.3); Groom sai id hoặc sai vai trò vẫn 400.
- Tách lý do "không được tập" / "không được đua" thành `trainingReasons` / `racingReasons` (III.4, F1.3 mục 2).
- Lượt tập mới tạo không còn mang lý do chỉ chặn đua (ngựa `UNDER_OBSERVATION` được tập thì lý do để trống).
- Tab Huấn luyện: lịch `upcoming` bỏ lượt đã hủy (F1.6 mục 4, F1.8 mục 1).
- III.3.2 thêm hướng RETIRED → TRANSFERRED.

Còn lại, chưa làm:

- ~~Tổng chi phí y tế ở tab Bệnh án (F1.3)~~ Có từ Flow 3: `GET /horses/:id/medical-cases` trả `totalCost` (tổng các bệnh án đã đóng); Head Trainer không có key này.
- **Tab 1 hồ sơ (F1.3 mục 1)**: hồ sơ, phả hệ, lịch sử chỉ số, quyền và ảnh là 5 API riêng (`GET /horses/:id`, `/pedigree`, `/measurements`, `/permissions`, `/photo-url`); FE gọi song song khi mở hồ sơ.
- ~~Chỉ số cơ thể (F1.5)~~ Đã làm: cờ bất thường lưu lúc ghi (`is_abnormal`), xác nhận ghi vào nhật ký; lịch sử lọc `from`/`to`/`type` và phân trang.
- ~~Danh sách ngựa (F1.1)~~ Đã làm: mỗi dòng có `photoUrl` ký sẵn, vẫn giữ `mediaId`.
- ~~Xếp ô và giao Groom (F1.7)~~ Đã làm: thêm `PUT /horses/:id/placement` chạy một transaction; giữ hai API lẻ.
- ~~Đổi khu (F1.6 mục 4)~~ Đã làm: rút khỏi mọi lớp không do Head Trainer khu mới phụ trách (bao cả ca khu cũ đã bàn giao Head Trainer).
- ~~Tab Huấn luyện chưa gộp đánh giá~~ Đã làm: mỗi buổi trong `/training/sessions` có `evaluation`.

### 1d. BA trả lời 11 câu hỏi Flow 1

Đã đưa vào thân đặc tả. Câu 1, 3, 6, 9, 11 giữ như hệ thống đang chạy (chỉ sửa chữ). Câu 2, 4, 5, 7, 8, 10 đã sửa code cùng ngày:

- Câu 2: xếp khu lần đầu không bắt lý do (F1.6 mục 6).
- Câu 4: CLUB MANAGER thao tác ghi trên hồ sơ đã xóa trả 409 thay cho 403 (III.6.3).
- Câu 5: chủ sở hữu / HEAD TRAINER không còn hoạt động trả 409, sai tài khoản hoặc sai vai trò vẫn 400 (III.6.3).
- Câu 7: khôi phục hồ sơ luôn bỏ khu, có bảng xem trước hệ quả (F1.8 mục 4).
- Câu 8: VETERINARIAN xóa được bản ghi đo sai của ngựa đã chuyển nhượng (F1.5 mục 7).
- Câu 10: kích hoạt lại từ Đã giải nghệ giữ nguyên sức khỏe; hạn khám định kỳ theo ngày kích hoạt lại chỉ áp cho ngựa đã chuyển nhượng quay lại (F1.8 mục 3, Flow 3 III.3).

### 2. Cần quyết định

- MinIO (tạm giữ): README ghi Docker Compose tự tạo bucket nhưng `docker/compose.yaml` không có bước này. Đề xuất: thêm service `minio-init` (image `minio/mc`, `mc mb --ignore-existing`) tạo bucket `racehorse` và giữ bucket private, vì ảnh đọc qua presigned URL sau khi kiểm quyền.
- ~~409 khi hai người cùng sửa hồ sơ chưa trả kèm dữ liệu mới nhất~~ Chốt: BE giữ 409, FE nhận 409 "dữ liệu đã thay đổi" thì gọi lại `GET /horses/:id` (đúng mẫu chuẩn chống ghi đè: báo lỗi, client tự tải lại; không nhét hồ sơ vào body lỗi).

### 3. Ngoài Flow 1 nhưng nên làm sớm

Phần thông báo không còn giao Flow 2; đã làm (lưu MongoDB, API đọc, push FCM). Chi tiết ở `docs/cau-hoi-flow2.md` mục 2, nợ còn lại ở `docs/mongo-notifications-debt.md`.

- ~~API đọc thông báo đang trả 501~~ Đã làm: `GET /notifications`, `GET /notifications/unread-count`, `GET /notifications/:id`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- Chưa thử client socket thật nhận sự kiện `notification.created` (namespace `/events`, gửi token ở `auth.token`).
- ~~PATCH health-status (VET) đang nằm ở module horses; docs nói thuộc Flow 3.~~ Chuyển sang Flow 3 (lô 6), bắt buộc lý do và ghi nhật ký; bỏ chặn ELIGIBLE khi đang khóa (Flow 3 mục III.4.3).

### 3b. Phát hiện khi review nghiệp vụ, thuộc flow khác

- ~~Flow 2, CRUD ô/khu chuồng~~ Đã sửa: ô có ngựa không đổi khu/status được; xóa ô chạy trong transaction có lock; khu còn ngựa không xóa, không đóng, không gỡ HT được; không hạ sức chứa dưới số ô; thêm/sửa/xóa khu và ô đều ghi nhật ký; đổi ô sang Bảo trì hoặc xóa ô không được làm khu thiếu chỗ cho ngựa chờ xếp ô.
- ~~Flow 2, lớp học~~ Đã làm: ghi danh vào lớp chỉ nhận ngựa ACTIVE (409 với ngựa giải nghệ / chuyển nhượng); chuyển nhượng từ RETIRED cũng rút khỏi mọi lớp.
- ~~**Flow 3** (đang làm, lô 3–4): chưa có chỗ ghi số đo từ buổi khám vào `horse_measurements` (`source = MEDICAL_EXAM`, `medical_record_id`). Khi làm phải gọi lại `measurementAlerts` và phát event `horse.measurement.alert` như nhánh nhập tay (F1.5 A3, mục 6).~~ Đã làm: buổi khám ghi số đo qua `recordExamMeasurements`, phát cảnh báo sau commit (nguồn `MEDICAL_EXAM` không tự sinh yêu cầu khám).
- ~~FE: chưa có API xem trước cho "Xóa hồ sơ" và "Đổi khu"~~ Đã làm: `GET /horses/:id/deletion-preview` và `GET /horses/:id/barn-preview?barnId=`.
- ~~Mã lỗi 400 vs 403 khi gửi trường lạ~~ Chốt: code đúng, đã sửa câu F1.4 E5 cho rõ (403 thiếu quyền, 400 trường không thuộc biểu mẫu).

### 4. Việc tay

- Cần báo FE (theo câu trả lời BA): `PUT /horses/:id/barn` nhận `reason` tùy chọn khi ngựa đang Chờ xếp khu (đổi khu vẫn bắt buộc, thiếu trả 400); CLUB MANAGER thao tác ghi trên hồ sơ đã xóa nhận 409 thay cho 403; chọn chủ sở hữu / HEAD TRAINER không còn hoạt động nhận 409 (`Chủ sở hữu không ở trạng thái hoạt động`, `Head Trainer phụ trách không ở trạng thái hoạt động`), sai tài khoản hoặc sai vai trò nhận 400 (`Chủ sở hữu không hợp lệ`, `Head Trainer phụ trách không hợp lệ`); VETERINARIAN xóa được số đo của ngựa đã chuyển nhượng (`canDeleteMeasurement` bật); kích hoạt lại từ Đã giải nghệ giữ nguyên sức khỏe (preview không còn câu "đặt sức khỏe về Cần theo dõi"); khôi phục hồ sơ luôn đưa ngựa vào Chờ xếp khu, API mới `GET /horses/:id/restore-preview` (`barnCleared`, `ownerCleared`, `summary`).
- Cần báo FE (sau lần báo trước): API mới `DELETE /horses/:id/stall` gỡ ngựa khỏi ô theo id ngựa (FE không cần tìm id phân công ô nữa; `POST /stall-assignments/:id/end` vẫn giữ); HT xếp ô / giao Groom cho ngựa đã chuyển nhượng nhận câu "Ngựa đã chuyển nhượng…" thay cho "Ngựa chưa được xếp khu…"; cảnh báo sốt ghi `°C`.
- ~~Báo FE thay đổi API~~ Đã báo FE. Báo FE thay đổi API (xem `docs/api-catalog.md`): lọc danh sách (`includeDeleted`, `placementStatus`, `myBarns`, `myHorses`), body ghi chỉ số (`values[]`, `confirmAbnormal`), xóa chỉ số cần `reason`, API bỏ (`/horses/:id/owners`, `/horses/:id/activate`, `POST /stalls/:id/assignments`), API mới (`PUT /horses/:id/barn`, `PUT /horses/:id/stall`, `GET /grooms/workload`, `GET /horses/:id/lifecycle-status/preview`, `POST /horses/:id/restore`, `GET /horses/:id/photo-url`), tải ảnh cần `purpose=HORSE_PHOTO` và chỉ CM. Thay đổi: xem ảnh ngựa qua `GET /horses/:id/photo-url` (`GET /media/:id` và `/media/:id/download-url` chỉ còn cho người tải lên); bỏ `DELETE /horses/:id/groom` (chỉ còn đổi Groom); GROOM gọi `GET /horses/:id/training-plans` nhận 403; preview đổi vòng đời có thêm `pendingBarnAfter`, `ownerCleared`; khóa tài khoản còn phụ trách ngựa/khu trả 409. Thay đổi lần 6: `GET /horses/:id/medical-cases` trả `totalCost` là tổng mọi bệnh án đã đóng, kể cả khi lọc `?status=`; `notes` của lịch chăm sóc nhận `null` để xóa ghi chú; danh sách lượt tập `GET /training-sessions/:sessionId/participants` có thêm `trainingLocked`. Thay đổi lần 5: API mới `GET /horses/:id/deletion-preview` (xóa được không, từng lý do chặn) và `GET /horses/:id/barn-preview?barnId=` (bảng hệ quả đổi khu kèm `summary`). Thay đổi lần 4 (**có thay đổi phá vỡ**): `GET /horses/:id/measurements` trả `{ items, meta }` thay cho mảng, nhận thêm `from`, `to`, `page`, `limit` (tối đa 500); danh sách ngựa có thêm `photoUrl`; `/training/sessions` có thêm `evaluation`; có API mới `PUT /horses/:id/placement` (xếp ô + giao Groom một lần); đổi khu rút khỏi mọi lớp không do HT khu mới phụ trách. Thay đổi lần 3: ghi danh ngựa không ACTIVE vào lớp trả 409; chuyển nhượng từ RETIRED cũng rút lớp (preview `classesWithdrawn` > 0); giao Groom điền cả lượt tập chưa ai dắt; nhận 409 "dữ liệu đã thay đổi" khi sửa hồ sơ thì gọi lại `GET /horses/:id`. Thay đổi lần 2: khu không hoạt động và Groom không còn hoạt động trả 409 (trước 400), lỗi Groom tách hai câu `Groom phụ trách không hợp lệ` (400) / `Groom phụ trách không ở trạng thái hoạt động` (409); HT ngoài khu / Groom không được giao gặp ngựa đã chuyển nhượng nhận 403 (trước 409); eligibility có thêm `trainingReasons`, `racingReasons`; `/training/sessions?when=upcoming` không còn lượt đã hủy; có thêm `POST/GET /session-participants/:id/evaluation`. Thay đổi: preview đổi vòng đời đổi `trainingPlansCancelled` thành `classesWithdrawn` (số lớp bị rút), câu `summary` nói "lớp đang học" / "rút khỏi lớp"; Flow 2 đã bỏ `GET /horses/:id/training-plans`; tab Huấn luyện dùng `GET /horses/:horseId/training/classes` và `GET /horses/:horseId/training/sessions` (mục 1b).
