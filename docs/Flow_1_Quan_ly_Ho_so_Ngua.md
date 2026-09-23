# Đề bài

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
5. Không khóa được tài khoản của người còn đang phụ trách: GROOM còn ngựa được giao, HORSE OWNER còn ngựa chưa chuyển nhượng, HEAD TRAINER còn khu. Phải bàn giao trước (đổi GROOM, đổi chủ, đổi HEAD TRAINER của khu), giống luật đổi vai trò tài khoản. Mở lại tài khoản thì không chặn. *(BA chốt 2026-09-23)*

### 2. Trạng thái sức khỏe (do Flow 3 cập nhật, Flow 1 chỉ hiển thị)

1. Bốn giá trị:
   - **Đủ điều kiện (ELIGIBLE):** khỏe mạnh, tập và đua bình thường.
   - **Cần theo dõi (UNDER_OBSERVATION):** có dấu hiệu bất thường nhưng chưa xác định bệnh. Chỉ tập cường độ Nhẹ và Trung bình, không được đăng ký đua.
   - **Chấn thương (INJURED):** đang có tổn thương. Không tập, không đua.
   - **Cách ly (QUARANTINED):** nghi nhiễm bệnh truyền nhiễm. Không tập, không đua.
2. Trạng thái Cách ly là trạng thái y tế, không bắt buộc hệ thống phải chuyển ngựa sang một loại ô chuồng riêng. Nếu cần tách ngựa khỏi đàn, HEAD TRAINER phụ trách khu chuyển ngựa sang ô trống bằng F1.7.

### 3. Trạng thái vòng đời

1. Ba giá trị:
   - **Đang hoạt động (ACTIVE):** dùng đầy đủ mọi chức năng.
   - **Đã giải nghệ (RETIRED):** vẫn ở lại câu lạc bộ, vẫn được chăm sóc và chữa bệnh, không học lớp và không đăng ký đua.
   - **Đã chuyển nhượng (TRANSFERRED):** đã rời khỏi câu lạc bộ. Hồ sơ chuyển sang chỉ đọc.
2. Chuyển trạng thái đi và về đều được: ACTIVE ⇄ RETIRED và ACTIVE ⇄ TRANSFERRED. Trường hợp câu lạc bộ mua lại con ngựa đã bán thì kích hoạt lại hồ sơ cũ, không tạo hồ sơ mới (xem F1.8).

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
3. Truy cập ngoài phạm vi trả về 404. Mã 403 chỉ dùng khi người dùng xem được con ngựa nhưng không được thực hiện một thao tác cụ thể, hoặc vai trò không có quyền làm thao tác đó. Có quyền nhưng trạng thái dữ liệu không cho phép (ví dụ hồ sơ đã chuyển nhượng, khu hết chỗ, hai người cùng lưu) thì trả 409 kèm lý do. *(BA chốt 2026-09-23)*
4. Đổi vòng đời ghi một dòng nhật ký cho con ngựa, kèm đủ các hệ quả đã xảy ra: ô chuồng được trả, GROOM bị kết thúc phân công, lệnh khóa huấn luyện được gỡ, số đăng ký thi đấu bị rút, số giáo án bị hủy, chủ bị bỏ trống. *(BA chốt 2026-09-23)*

## Phụ lục: Thay đổi so với bản trước

Phần này để chiếu nhanh, không phải nội dung đặc tả.

| Nội dung bản cũ | Bản mới | Lý do |
|---|---|---|
| Nhiều chủ sở hữu, tỉ lệ phần trăm, chủ đại diện | Mỗi con ngựa có nhiều nhất một chủ | Góp ý của giảng viên: tỉ lệ phần trăm không tạo ra giá trị chức năng nào vì dự án không hỗ trợ thanh toán. |
| Ngựa tham chiếu (ngựa ngoài chỉ dùng cho phả hệ) | Bỏ hoàn toàn. Cha mẹ không có trong câu lạc bộ thì để trống | Không phục vụ chức năng nào ngoài việc hiển thị, nhưng kéo theo rất nhiều ngoại lệ ở mọi chức năng. |
| F1.5 Quản lý phả hệ và F1.6 Quản lý quyền sở hữu là hai chức năng riêng | Gộp vào F1.2 và F1.4 | Khi chỉ còn một chủ và không còn ngựa tham chiếu, cha, mẹ và chủ sở hữu chỉ là các trường của hồ sơ. |
| F1.8 Quản lý ảnh hồ sơ ngựa là chức năng riêng | Gộp vào F1.2 và F1.4 | Ảnh đại diện là một trường của hồ sơ. Việc tải tệp là chi tiết kỹ thuật, không phải chức năng nghiệp vụ. |
| Lịch sử sở hữu có ngày bắt đầu và ngày kết thúc | Chỉ lưu chủ hiện tại | Báo cáo chi phí theo giai đoạn sở hữu không nằm trong phạm vi các flow bắt buộc. |
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

---

## F1.1 — Xem danh sách ngựa (Xem)

### Mô tả

Liệt kê ngựa của câu lạc bộ, có tìm kiếm theo tên hoặc số chip định danh và lọc theo thông tin. Danh sách chỉ hiện thông tin tóm tắt, muốn xem đầy đủ phải mở hồ sơ chi tiết ở F1.3.

### Phân quyền — quyền thao tác

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Vai trò duy nhất bật được bộ lọc "hồ sơ đã xóa". Có bộ lọc riêng "Chờ xếp khu". |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Có bộ lọc "Khu của tôi" và "Chờ xếp ô". Danh sách không có nút thao tác nên không đánh dấu từng dòng; dùng bộ lọc "Khu của tôi" để thấy ngựa mình phụ trách *(BA chốt 2026-09-23)*. |
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
3. Ngày sinh không được là ngày trong tương lai.
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
   - Nếu cả con và cha (hoặc mẹ) đều có ngày sinh thì cha mẹ phải sinh trước con. Thiếu ngày sinh ở một bên thì bỏ qua kiểm tra này.
   - Không được tạo vòng lặp: một con ngựa không được là tổ tiên của chính nó.
   - Cha hoặc mẹ không có trong câu lạc bộ thì để trống. Hệ thống không lưu ngựa ngoài dưới bất kỳ dạng nào.
7. Chủ sở hữu: mỗi con ngựa có nhiều nhất một chủ, chọn từ danh sách tài khoản HORSE OWNER. Có thể để trống và gán sau bằng F1.4.
8. Ảnh đại diện: mỗi con ngựa có một ảnh, định dạng JPEG, PNG hoặc WebP, dung lượng tối đa 10 MB.
9. Khu chuồng: chỉ chọn được khu đã có HEAD TRAINER phụ trách và còn ít nhất một ô trống. Không chọn thì ngựa nằm trong danh sách "Chờ xếp khu" của CLUB MANAGER.
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
| **Tiền điều kiện** | CLUB MANAGER đã đăng nhập. Nếu muốn xếp khu ngay thì phải có khu đã có HEAD TRAINER phụ trách và còn ô trống. |
| **Hậu điều kiện** | Hồ sơ ngựa được tạo ở trạng thái Đủ điều kiện và Đang hoạt động. Nếu có chọn khu thì ngựa thuộc khu đó và nằm trong danh sách "Chờ xếp ô" của HEAD TRAINER phụ trách khu. |
| **Luồng sự kiện chính** | 1. CLUB MANAGER chọn "Thêm ngựa mới".<br>2. Hệ thống hiển thị biểu mẫu khai báo.<br>3. CLUB MANAGER nhập thông tin cơ bản và tải ảnh đại diện.<br>4. CLUB MANAGER chọn cha và mẹ từ danh sách ngựa của câu lạc bộ (có thể bỏ qua).<br>5. CLUB MANAGER chọn chủ sở hữu (có thể bỏ qua).<br>6. CLUB MANAGER chọn khu chuồng (có thể bỏ qua).<br>7. CLUB MANAGER gửi biểu mẫu.<br>8. Hệ thống kiểm tra các điều kiện hợp lệ.<br>9. Hệ thống tạo hồ sơ và xếp khu trong cùng một giao dịch.<br>10. Hệ thống ghi nhật ký và mở màn hình chi tiết. |
| **Luồng thay thế** | A1. CLUB MANAGER chọn "Lưu và thêm tiếp" → hệ thống giữ biểu mẫu trống để nhập con tiếp theo.<br>A2. Bỏ qua phần chủ sở hữu hoặc khu chuồng → bổ sung sau bằng F1.4 và F1.6.<br>A3. Chưa rõ sở trường cự ly → để trống, HEAD TRAINER bổ sung sau bằng F1.4. |
| **Luồng ngoại lệ** | E1. Số chip định danh trùng → báo lỗi ngay tại ô nhập.<br>E2. Ngày sinh ở tương lai → báo lỗi.<br>E3. Cha hoặc mẹ sai giới tính, trùng nhau, sinh sau con hoặc tạo vòng lặp → báo lỗi.<br>E4. Khu chuồng vừa hết ô trống → tải lại danh sách khu.<br>E5. Lưu thất bại giữa chừng → hủy toàn bộ, không tạo hồ sơ. |

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
| 2. Bệnh án: danh sách bệnh án, các buổi khám, tổng chi phí y tế (Flow 3) | Xem | Xem | Xem | Không | Xem |
| 3. Huấn luyện: lớp đang học, lịch buổi tập, kết quả và nhận xét sau buổi tập (Flow 2) | Xem | Xem | Xem | Không | Xem |
| 4. Thành tích thi đấu (Flow 5) | Xem | Xem | Không | Không | Xem |

GROOM không xem hai tab Bệnh án và Huấn luyện ở màn hình này; dữ liệu của hai tab này không được gửi về máy GROOM. Phần thông tin GROOM cần để làm việc (giờ tập trong ngày, khẩu phần) nằm ở lịch công việc hằng ngày thuộc Flow 2 và Flow 4.

Ảnh đại diện: ai xem được hồ sơ ngựa thì xem được ảnh của ngựa đó. Với hồ sơ đã xóa, CLUB MANAGER vẫn xem được (chỉ đọc) bệnh án, chỉ số, thành tích, kết quả đua và lịch sử GROOM như khi xem hồ sơ. *(BA chốt 2026-09-23)*

### Nghiệp vụ

1. Tab 1 tải cùng hồ sơ. Các tab 2, 3, 4 là dữ liệu từ flow khác nên tải riêng khi người dùng mở tab, không tải hết một lần.
2. Khi con ngựa không được tập hoặc không được đua, hệ thống phải hiện lý do cụ thể, ví dụ "Đang chấn thương", "Đang bị khóa huấn luyện", "Đã giải nghệ".
3. Cây phả hệ:
   - Hiển thị tối đa 3 đời: con ngựa đang xem, cha mẹ, ông bà.
   - Chỉ vẽ từ những con có hồ sơ tại câu lạc bộ. Ô nào không khai báo được thì để trống.
   - Bấm vào một tổ tiên sẽ mở hồ sơ của con đó theo đúng phạm vi quyền của người xem. Với HORSE OWNER, nếu tổ tiên không thuộc sở hữu của mình thì chỉ hiện tên và vị trí trong cây (cha/mẹ của ai, đời mấy), không mở được và không nhận giới tính, giống, màu lông, ngày sinh, sở trường của con đó. *(BA chốt 2026-09-23)*
4. Hồ sơ đã chuyển nhượng và hồ sơ đã xóa hiển thị ở chế độ chỉ đọc, không hiện nút thao tác nào, trừ nút "Kích hoạt lại" (ngựa đã chuyển nhượng) và "Khôi phục" (hồ sơ đã xóa) của CLUB MANAGER theo F1.8. *(BA chốt 2026-09-23)*
5. Con ngựa ngoài phạm vi xem trả về 404, không trả 403. Áp dụng cho HORSE OWNER xem ngựa không sở hữu và cho các vai trò khác CLUB MANAGER xem hồ sơ đã xóa.

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

1. Các quy tắc hợp lệ của F1.2 được áp dụng lại: số chip không trùng, ngày sinh không ở tương lai, quy tắc chọn cha mẹ, định dạng và dung lượng ảnh.
2. Không cho đổi giới tính nếu con ngựa đang được dùng làm cha hoặc mẹ của con khác mà giới tính mới làm sai vai trò. Chuyển từ MALE sang GELDING luôn được phép. Đổi ngày sinh của ngựa đang làm cha hoặc mẹ thì vẫn phải sinh trước con sớm nhất, tính cả con đã bị xóa hồ sơ (vì con đó có thể được khôi phục). *(BA chốt 2026-09-23)*
3. Đổi cha hoặc mẹ phải kiểm tra lại vòng lặp phả hệ.
4. Đổi chủ sở hữu (chỉ CLUB MANAGER):
   - Hệ thống chỉ lưu chủ hiện tại, không lưu lịch sử sở hữu.
   - Chủ mới thấy được toàn bộ lịch sử của con ngựa, gồm cả bệnh án và chi phí phát sinh từ thời chủ cũ.
   - Chủ cũ mất quyền xem ngay khi việc đổi chủ được lưu.
   - Việc đổi chủ được ghi vào nhật ký: từ ai sang ai, ai thực hiện, thời điểm nào.
5. Không cho sửa hồ sơ của ngựa đã chuyển nhượng hoặc hồ sơ đã xóa.
6. Khi HEAD TRAINER gửi kèm những trường ngoài quyền, hệ thống phải từ chối và báo lỗi, không âm thầm bỏ qua.
7. Nếu hai người cùng mở một hồ sơ và cùng bấm lưu, người lưu sau bị chặn và được thông báo dữ liệu vừa thay đổi kèm nội dung mới nhất. Không ghi đè âm thầm.
8. Ghi nhật ký thao tác đầy đủ giá trị trước và sau.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-04 |
| **Tên use case** | Cập nhật hồ sơ ngựa |
| **Actor chính** | CLUB MANAGER, HEAD TRAINER |
| **Actor phụ** | Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | Người dùng đã đăng nhập. HEAD TRAINER chỉ thao tác với ngựa thuộc khu mình phụ trách. Hồ sơ không ở trạng thái Đã chuyển nhượng và chưa bị xóa. |
| **Hậu điều kiện** | Thông tin được cập nhật. Nhật ký ghi lại giá trị trước và sau. |
| **Luồng sự kiện chính** | 1. Người dùng mở hồ sơ và chọn "Chỉnh sửa".<br>2. Hệ thống hiển thị biểu mẫu chỉ gồm các trường người dùng được sửa.<br>3. Người dùng sửa thông tin.<br>4. Người dùng gửi biểu mẫu.<br>5. Hệ thống kiểm tra điều kiện hợp lệ và kiểm tra phiên bản dữ liệu.<br>6. Hệ thống lưu, ghi nhật ký và hiển thị lại hồ sơ. |
| **Luồng thay thế** | A1. CLUB MANAGER đổi chủ sở hữu → chọn tài khoản chủ mới hoặc bỏ trống.<br>A2. CLUB MANAGER đổi ảnh đại diện → ảnh cũ bị thay thế.<br>A3. HEAD TRAINER chỉ sửa sở trường cự ly sau khi đánh giá chuyên môn. |
| **Luồng ngoại lệ** | E1. Số chip định danh trùng → báo lỗi.<br>E2. Đổi giới tính làm sai vai trò cha hoặc mẹ của con khác → chặn và giải thích.<br>E3. Cha hoặc mẹ mới tạo vòng lặp phả hệ → chặn.<br>E4. Người khác vừa lưu trước → chặn, hiện dữ liệu mới nhất.<br>E5. HEAD TRAINER gửi kèm trường ngoài quyền → trả về 403. |

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
7. Không ghi chỉ số cho ngựa đã chuyển nhượng hoặc hồ sơ đã xóa.
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
| **Luồng thay thế** | A1. Người dùng ghi nhiều loại chỉ số trong cùng một lần đo.<br>A2. VETERINARIAN phát hiện bản ghi sai → xóa kèm lý do rồi đo lại.<br>A3. Số đo đến từ một buổi khám của Flow 3 → hệ thống tự ghi vào đây kèm nguồn. |
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
2. Chỉ chọn được khu đã có HEAD TRAINER phụ trách và còn ít nhất một ô trống.
3. Ngựa chưa được xếp khu nằm trong danh sách "Chờ xếp khu" của CLUB MANAGER. Trong thời gian này không HEAD TRAINER nào thao tác được với con ngựa đó.
4. Hệ quả khi đổi khu:
   - Ô chuồng cũ được trả về trạng thái trống.
   - Ngựa chuyển sang danh sách "Chờ xếp ô" của HEAD TRAINER khu mới.
   - Phân công GROOM giữ nguyên, vì GROOM gắn với con ngựa chứ không gắn với khu.
   - Ngựa bị rút khỏi các lớp đang học của HEAD TRAINER khu cũ. Các buổi chưa diễn ra biến mất khỏi lịch của con ngựa, các buổi đã học giữ nguyên lịch sử.
   - HEAD TRAINER khu mới nhận thông báo và đăng ký lớp lại nếu cần.
5. Chỉ xếp khu và đổi khu cho ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. Ngựa đã chuyển nhượng hoặc hồ sơ đã xóa thì không thao tác được.
6. Bắt buộc nhập lý do khi đổi khu. Ghi nhật ký thao tác.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-06 |
| **Tên use case** | Xếp khu chuồng cho ngựa |
| **Actor chính** | CLUB MANAGER |
| **Actor phụ** | HEAD TRAINER (nhận thông báo), Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | CLUB MANAGER đã đăng nhập. Có ít nhất một khu đã có HEAD TRAINER phụ trách và còn ô trống. Ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. |
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
   - Chỉ giao hoặc đổi GROOM được khi khu của ngựa đang hoạt động; GROOM được giao phải là tài khoản GROOM đang hoạt động. *(BA chốt 2026-09-23)*
   - Không có thao tác "gỡ GROOM mà không giao ai": HEAD TRAINER chỉ giao hoặc đổi GROOM, nên ngựa luôn có GROOM phụ trách. GROOM chỉ tự kết thúc khi ngựa chuyển nhượng (F1.8). *(BA chốt 2026-09-23)*
6. Hệ quả khi đổi GROOM:
   - GROOM cũ mất quyền thao tác trên con ngựa đó nhưng vẫn xem được hồ sơ như mọi vai trò khác.
   - Phần công việc trong ngày chưa hoàn thành và các đầu việc buổi tập trong tương lai chuyển sang GROOM mới.
   - Công việc đã hoàn thành giữ nguyên tên người đã làm.
   - Nếu GROOM mới đã có checklist cùng ngày cho con ngựa này (ví dụ đổi A → B → A trong một ngày) thì hệ thống báo lỗi, không tự gộp hay xóa việc. *(BA chốt 2026-09-23)*
7. Chuyển ô trong cùng một khu không ảnh hưởng tới GROOM, lớp học hay lịch tập.
8. Ngựa đã giải nghệ vẫn giữ ô chuồng và GROOM phụ trách, vì vẫn được chăm sóc và chữa bệnh.
9. Ghi nhật ký thao tác.
10. HEAD TRAINER gỡ được ngựa khỏi ô (ví dụ khi cần sửa ô); ngựa quay lại danh sách "Chờ xếp ô" của khu, GROOM giữ nguyên. *(BA chốt 2026-09-23)*

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

Chuyển ngựa sang Đã giải nghệ hoặc Đã chuyển nhượng, kích hoạt lại ngựa quay về câu lạc bộ, và xóa mềm hồ sơ tạo nhầm.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| CLUB MANAGER | Sửa, Xóa | Toàn câu lạc bộ | Bắt buộc nhập lý do cho mọi thao tác. |
| HEAD TRAINER | Không | | Chỉ đề xuất bằng ghi chú. |
| VETERINARIAN | Không | | Chỉ khuyến nghị về mặt y tế. |
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
   - Giữ nguyên chủ sở hữu trên hồ sơ để chủ cũ vẫn tra cứu được, hồ sơ chuyển sang chế độ chỉ đọc và có nhãn "Đã chuyển nhượng".
   - GROOM vừa bị kết thúc phân công nhận thông báo "Ngựa X đã chuyển nhượng, bạn không còn phụ trách".
3. **Kích hoạt lại (RETIRED hoặc TRANSFERRED quay về ACTIVE):**
   - Dùng cho trường hợp ngựa quay lại tập luyện hoặc câu lạc bộ mua lại con ngựa đã bán. Luôn kích hoạt lại hồ sơ cũ, không tạo hồ sơ mới, vì số chip định danh gắn với con vật ngoài đời thật và mọi dữ liệu lịch sử, phả hệ đang gắn với hồ sơ này.
   - Toàn bộ dữ liệu cũ được giữ nguyên: bệnh án, chỉ số cơ thể, thành tích, phả hệ, số chip định danh.
   - Lớp học và đăng ký thi đấu đã hủy không tự khôi phục.
   - Nếu kích hoạt lại từ Đã chuyển nhượng: CLUB MANAGER phải xếp lại khu (F1.6), HEAD TRAINER xếp lại ô và GROOM (F1.7), gán lại chủ sở hữu bằng F1.4 nếu chủ mới khác chủ cũ. Nếu chủ cũ không còn là tài khoản HORSE OWNER đang hoạt động thì hệ thống bỏ trống chủ; bảng xác nhận báo trước "sẽ bỏ trống chủ X". *(BA chốt 2026-09-23)*
   - Trạng thái sức khỏe được đặt về "Cần theo dõi" cho tới khi bác sĩ khám lại, vì dữ liệu sức khỏe trong thời gian ngựa ở ngoài câu lạc bộ không còn đáng tin.
4. **Xóa hồ sơ (xóa mềm):**
   - Chỉ dành cho hồ sơ vừa tạo nhầm và chưa dùng vào việc gì.
   - Bị chặn nếu con ngựa đã phát sinh bất kỳ dữ liệu nghiệp vụ nào: bệnh án, chỉ số cơ thể, xếp ô chuồng, phân công GROOM, lớp học, đăng ký thi đấu, khẩu phần ăn, checklist hằng ngày, báo cáo sự cố. Cũng bị chặn nếu con ngựa đang là cha hoặc mẹ của con khác.
   - Hồ sơ bị ẩn khỏi mọi vai trò trừ CLUB MANAGER. Số chip định danh vẫn bị coi là đã sử dụng.
   - Dữ liệu lịch sử và nhật ký thao tác không bao giờ bị xóa theo.
   - CLUB MANAGER khôi phục được hồ sơ đã xóa, hồ sơ trở về đúng trạng thái trước khi xóa. Riêng khu chuồng: nếu khu cũ không còn nhận được ngựa (hết chỗ, ngừng hoạt động, không còn HEAD TRAINER phụ trách hoặc đã bị xóa) thì bỏ khu, ngựa vào danh sách "Chờ xếp khu". Riêng chủ sở hữu: nếu chủ cũ không còn là tài khoản HORSE OWNER đang hoạt động thì bỏ trống chủ, CLUB MANAGER chọn chủ mới sau. *(BA chốt 2026-09-23)*
   - Hồ sơ đã xóa không đổi vòng đời được, kể cả mở bảng xem trước hệ quả; CLUB MANAGER phải khôi phục hồ sơ trước. *(BA chốt 2026-09-23)*
5. Mọi thao tác trong chức năng này bắt buộc nhập lý do, phải hiện bảng liệt kê hệ quả để xác nhận trước khi thực hiện, và phải thành công hoặc thất bại cùng nhau (Atomic).
6. Ghi nhật ký thao tác kèm lý do.
7. Buổi tập đang diễn ra lúc ngựa giải nghệ hoặc chuyển nhượng: hiện giữ lại buổi đó; chốt cách xử lý cùng mô hình lớp học ở Flow 2. *(BA chốt 2026-09-23)*

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F1-08 |
| **Tên use case** | Thay đổi trạng thái vòng đời và xóa hồ sơ |
| **Actor chính** | CLUB MANAGER |
| **Actor phụ** | Hệ thống (ghi nhật ký, xử lý dữ liệu liên quan) |
| **Tiền điều kiện** | CLUB MANAGER đã đăng nhập. Hồ sơ ngựa tồn tại trong hệ thống. |
| **Hậu điều kiện** | Trạng thái vòng đời được thay đổi hoặc hồ sơ bị ẩn. Các dữ liệu liên quan được xử lý theo quy tắc. Nhật ký ghi lại lý do. |
| **Luồng sự kiện chính** | 1. CLUB MANAGER mở hồ sơ và chọn "Đổi trạng thái vòng đời".<br>2. Hệ thống hiển thị các trạng thái có thể chuyển sang kèm mô tả hệ quả.<br>3. CLUB MANAGER chọn trạng thái và nhập lý do.<br>4. Hệ thống hiển thị bảng xác nhận liệt kê toàn bộ hệ quả.<br>5. CLUB MANAGER xác nhận.<br>6. Hệ thống thực hiện trong một giao dịch và ghi nhật ký. |
| **Luồng thay thế** | A1. CLUB MANAGER chọn "Xóa hồ sơ" với hồ sơ tạo nhầm → hệ thống kiểm tra điều kiện xóa trước khi thực hiện.<br>A2. CLUB MANAGER khôi phục hồ sơ đã xóa → hồ sơ trở về trạng thái trước khi xóa.<br>A3. Câu lạc bộ mua lại ngựa đã bán → CLUB MANAGER kích hoạt lại hồ sơ cũ, hệ thống đặt sức khỏe về "Cần theo dõi" và đưa ngựa vào danh sách "Chờ xếp khu". |
| **Luồng ngoại lệ** | E1. Hồ sơ đã phát sinh dữ liệu nghiệp vụ → không cho xóa, hệ thống liệt kê các dữ liệu đang vướng.<br>E2. Con ngựa đang là cha hoặc mẹ của con khác → không cho xóa.<br>E3. Không nhập lý do → chặn thao tác.<br>E4. Thực hiện thất bại giữa chừng → hủy toàn bộ, giữ nguyên trạng thái cũ. |

---

## Phụ lục 1b: Danh mục khu và ô chuồng (dùng chung với Flow 2)

Chỉ CLUB MANAGER tạo, sửa, xóa khu và ô. Flow 1 dựa vào danh mục này để xếp khu (F1.6) và xếp ô (F1.7). *(BA chốt 2026-09-23)*

1. Ô mới tạo luôn ở trạng thái Trống. Người dùng chỉ đổi được Trống ⇄ Bảo trì, và chỉ khi ô không có ngựa. "Đang có ngựa" và "Trống" do việc xếp và gỡ ngựa tự đổi. Không có trạng thái "Đặt trước".
2. Khu còn ngựa thì không được chuyển sang Đóng hoặc Bảo trì, không được gỡ HEAD TRAINER phụ trách, không được xóa. Muốn làm thì chuyển ngựa sang khu khác trước. Khu còn ô cũng không xóa được.
3. Sức chứa là số ô tối đa của khu. Không hạ sức chứa xuống dưới số ô đang có (áp cho mọi khu, còn ngựa hay không); muốn hạ thì xóa bớt ô trước. Khu đã đủ sức chứa thì không tạo thêm ô.
4. Ô đang có ngựa không xóa được và không chuyển sang khu khác được.
5. Không đổi ô trống sang Bảo trì, không chuyển ô trống sang khu khác và không xóa ô trống nếu việc đó làm khu thiếu ô cho ngựa đang "Chờ xếp ô".
6. Thêm, sửa, xóa khu và ô đều ghi nhật ký.

## Phụ lục 2: Việc còn nợ khi triển khai

Phần này để team theo dõi việc còn lại, không phải nội dung đặc tả.

Cập nhật: 2026-09-23 (lần 2). Theo dõi chi tiết từng task: https://claude.ai/artifact/LBQGJP8TdKxQjzydHfPryJ (trạng thái "Tạm dừng").

### 1. Chờ Flow 2 làm mô hình "lớp học" (BE đã chốt: sửa bên Flow 2)

Hiện hệ thống chỉ có giáo án (training plan) 1 ngựa/giáo án, chưa có lớp học nhiều ngựa.
Khi Flow 2 xong, làm các việc sau:

| # | Việc | Docs | Chỗ trong code | Tạm thời đang làm gì |
|---|---|---|---|---|
| 1 | Training export hàm rút ngựa khỏi lớp (buổi chưa diễn ra biến mất, buổi đã học giữ nguyên) | F1.6 mục 4, F1.8 mục 1 | `src/modules/training` (service lớp học mới) | — |
| 2 | Đổi khu thì rút ngựa khỏi lớp của Head Trainer khu cũ | F1.6 mục 4, use case bước 6 | `src/modules/horses/horse-placements/horse-placements.service.ts` (`assignBarn`) | Chưa rút gì, giáo án cũ vẫn chạy |
| 3 | Giải nghệ / chuyển nhượng thì rút ngựa khỏi lớp | F1.8 mục 1, 2 | `src/modules/horses/horse-statuses/horse-statuses.service.ts` (`updateLifecycle`, cờ `cancelTraining`) | Gọi `HorseStatusesRepository.cancelOpenTrainingPlans` (horses tự ghi bảng training — nợ kiến trúc, thay bằng hàm export của training) |
| 4 | Đổi Groom thì chuyển đầu việc buổi tập tương lai sang Groom mới | F1.7 mục 6 | Training export hàm, `src/modules/stable/groom-assignments/groom-assignments.service.ts` (`assign`) gọi trong cùng transaction | Chỉ chuyển checklist hằng ngày, chưa chuyển buổi tập |
| 5 | Câu tóm tắt ở màn xác nhận đổi vòng đời nói "lớp" thay cho "giáo án" | BA ví dụ "Winx đang có 2 lớp…" | `lifecycleImpactSummary` trong `src/modules/horses/policies/horse.policy.ts`, `lifecycleImpact` trong `horse-statuses.repository.ts` | Đang đếm giáo án đang mở |

### 2. Cần quyết định

- MinIO: README ghi Docker Compose tự tạo bucket nhưng `docker/compose.yaml` không có bước này. Chọn: (A) thêm service `minio-init` tạo bucket `racehorse`, hoặc (B) sửa README hướng dẫn tạo tay.
- 409 khi hai người cùng sửa hồ sơ (F1.4 mục 7) chưa trả kèm dữ liệu mới nhất vì filter lỗi chung (`src/common/filters/http-exception.filter.ts`) chỉ trả `code/message/details`. Muốn làm thì sửa filter chung.

### 3. Ngoài Flow 1 nhưng nên làm sớm

- API đọc thông báo đang trả 501: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`. Không có thì người offline không xem lại được thông báo (thông báo vẫn lưu trong bảng `notifications`).
- Chưa thử client socket thật nhận sự kiện `notification.created` (namespace `/events`, gửi token ở `auth.token`).
- PATCH health-status (VET) đang nằm ở module horses; docs nói thuộc Flow 3.

### 3b. Phát hiện khi review nghiệp vụ (2026-09-23), thuộc flow khác

- ~~Flow 2, CRUD ô/khu chuồng~~ Đã sửa 2026-09-23: ô có ngựa không đổi khu/status được; xóa ô chạy trong transaction có lock; khu còn ngựa không xóa, không đóng, không gỡ HT được; không hạ sức chứa dưới số ô; thêm/sửa/xóa khu và ô đều ghi nhật ký; đổi ô sang Bảo trì hoặc xóa ô không được làm khu thiếu chỗ cho ngựa chờ xếp ô.
- **Flow 2, giáo án**: `training-plans.service` tạo giáo án cho ngựa RETIRED được, và không lock ngựa. Khi RETIRED → TRANSFERRED thì giáo án này không bị hủy.
- **Flow 3**: chưa có chỗ ghi số đo từ buổi khám vào `horse_measurements` (`source = MEDICAL_EXAM`, `medical_record_id`). Khi làm phải gọi lại `measurementAlerts` và phát event `horse.measurement.alert` như nhánh nhập tay (F1.5 A3, mục 6).
- **FE**: chưa có API xem trước cho "Xóa hồ sơ" (danh sách dữ liệu đang vướng chỉ biết khi bấm xóa và nhận 409) và cho "Đổi khu" (F1.6 A2 bảng hệ quả) — FE tự dựng từ chi tiết ngựa hoặc làm thêm API preview.
- Mã lỗi: gửi trường không có trong DTO sửa hồ sơ trả 400 (validation), không phải 403 như F1.4 E5. Vẫn là "từ chối và báo lỗi"; chốt với FE nếu cần đúng 403.

### 4. Việc tay

- Báo FE thay đổi API (xem `docs/api-catalog.md`): lọc danh sách (`includeDeleted`, `placementStatus`, `myBarns`, `myHorses`), body ghi chỉ số (`values[]`, `confirmAbnormal`), xóa chỉ số cần `reason`, API bỏ (`/horses/:id/owners`, `/horses/:id/activate`, `POST /stalls/:id/assignments`), API mới (`PUT /horses/:id/barn`, `PUT /horses/:id/stall`, `GET /grooms/workload`, `GET /horses/:id/lifecycle-status/preview`, `POST /horses/:id/restore`, `GET /horses/:id/photo-url`), tải ảnh cần `purpose=HORSE_PHOTO` và chỉ CM. Thay đổi 2026-09-23: xem ảnh ngựa qua `GET /horses/:id/photo-url` (`GET /media/:id` và `/media/:id/download-url` chỉ còn cho người tải lên); bỏ `DELETE /horses/:id/groom` (chỉ còn đổi Groom); GROOM gọi `GET /horses/:id/training-plans` nhận 403; preview đổi vòng đời có thêm `pendingBarnAfter`, `ownerCleared`; khóa tài khoản còn phụ trách ngựa/khu trả 409.
- Commit (chưa commit gì).
