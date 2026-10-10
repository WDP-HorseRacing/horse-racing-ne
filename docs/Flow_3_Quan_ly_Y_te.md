# FLOW 3: LUỒNG QUẢN LÝ Y TẾ

> Cập nhật: 09/10/2026

## I. Những main feature liên quan

### VETERINARIAN (Bác sĩ Thú y)

- Ghi nhận buổi khám, bệnh án và quá trình điều trị của từng con ngựa, kèm đơn thuốc nếu có.
- Đánh dấu vị trí chấn thương trên mô hình 3D của ngựa để theo dõi diễn biến hồi phục.
- Cập nhật trạng thái sức khỏe theo bốn mức: Đủ điều kiện, Cần theo dõi, Chấn thương, Cách ly.
- Khóa chức năng huấn luyện khi ngựa chưa đủ sức khỏe.
- Theo dõi lịch khám định kỳ, lịch tiêm phòng, tẩy giun và kiểm tra móng, nhận thông báo khi đến hạn.
- Xem sơ đồ trạng thái sức khỏe của toàn bộ đàn ngựa.

### HORSE OWNER (Chủ sở hữu Ngựa)

- Theo dõi tình trạng sức khỏe và quá trình điều trị của ngựa thuộc sở hữu.
- Nhận báo cáo chi phí y tế của ngựa thuộc sở hữu.

### HEAD TRAINER (Huấn luyện viên Trưởng)

- Biết con ngựa nào đang không được tập hoặc không được đua để sắp xếp lịch huấn luyện.
- Gửi yêu cầu khám khi thấy ngựa bất thường trong buổi tập.

### GROOM / STABLE HAND (Nhân viên Chăm sóc & Chuồng trại)

- Báo cáo sự cố hoặc dấu hiệu bất thường của ngựa để bác sĩ xử lý (chức năng nằm ở Flow 4, Flow 3 nhận kết quả dưới dạng yêu cầu khám).
- Thực hiện lịch chăm sóc được giao (ví dụ kiểm tra móng) và đánh dấu hoàn tất.

### CLUB MANAGER (Quản lý Câu lạc bộ)

- Theo dõi tình hình sức khỏe chung của đàn ngựa và chi phí y tế phát sinh.
- Theo dõi nhật ký thao tác của toàn hệ thống.

## II. Chức năng

| Mã | Tên chức năng |
|---|---|
| F3.1 | Xem bảng điều khiển y tế (Xem) |
| F3.2 | Quản lý lịch khám định kỳ (Xem, Sửa) |
| F3.3 | Ghi nhận buổi khám ngoài bệnh án (Thêm, Xem) |
| F3.4 | Tiếp nhận yêu cầu khám khi ngựa có vấn đề (Thêm, Sửa, Xem) |
| F3.5 | Mở bệnh án (Thêm) |
| F3.6 | Ghi nhận buổi khám trong bệnh án và hủy buổi khám ghi sai (Thêm, Xem, Sửa) |
| F3.7 | Cập nhật trạng thái sức khỏe (Sửa) |
| F3.8 | Đặt và gỡ khóa huấn luyện (Thêm, Xóa) |
| F3.9 | Đóng bệnh án, chốt và điều chỉnh chi phí (Sửa) |
| F3.10 | Xem bệnh án và báo cáo y tế (Xem) |
| F3.11 | Quản lý lịch chăm sóc định kỳ: tiêm phòng, tẩy giun, kiểm tra móng (Thêm, Sửa, Xem) |

## III. Quy ước chung của Flow 3

Các quy ước của Flow 1 (phạm vi vai trò, trạng thái vòng đời, nhật ký thao tác, mã lỗi 404 / 403 / 409) vẫn áp dụng nguyên vẹn. Phần này chỉ bổ sung những quy ước riêng của luồng y tế.

### 1. Hai loại buổi khám

1. **Buổi khám ngoài bệnh án** (F3.3): con ngựa chưa có bệnh án đang mở. Có hai loại:
   - Khám định kỳ: theo lịch, không cần ngựa có vấn đề.
   - Khám theo yêu cầu: xuất phát từ một hoặc nhiều yêu cầu khám (F3.4).
2. **Buổi khám trong bệnh án** (F3.6): con ngựa đang có bệnh án mở, gọi là buổi tái khám.
3. Buổi khám ngoài bệnh án có kết luận **Bình thường** hoặc **Có vấn đề**:
   - Bình thường: buổi khám là bản ghi độc lập, không thuộc bệnh án nào. Mục đích là tránh sinh ra hàng loạt bệnh án rỗng.
   - Có vấn đề: bắt buộc mở bệnh án ngay trong cùng thao tác lưu (F3.5). Buổi khám trở thành buổi đầu tiên của bệnh án. Việc lưu buổi khám và mở bệnh án thành công hoặc thất bại cùng nhau.
4. Hai loại buổi khám dùng chung cách ghi số đo, đơn thuốc, chấn thương và cùng cập nhật trạng thái sức khỏe.

### 2. Bệnh án và buổi khám

1. Một bệnh án gồm nhiều buổi khám. Đây là yêu cầu trực tiếp của giảng viên.
2. Mỗi con ngựa có tối đa **MỘT** bệnh án đang mở. Vấn đề mới phát sinh trong lúc đang điều trị thì ghi thêm một buổi khám vào bệnh án đang mở, không mở bệnh án thứ hai.
3. Con ngựa đang có bệnh án mở thì không ghi được buổi khám ngoài bệnh án; mọi buổi khám đều vào bệnh án đó.
4. Buổi khám đã lưu thì không sửa và không xóa. Ghi sai thì bác sĩ **hủy** buổi khám kèm lý do (F3.6):
   - Buổi khám bị hủy vẫn hiển thị, có nhãn "Đã hủy" và lý do, không xóa khỏi hệ thống.
   - Số đo lấy trong buổi khám bị hủy được xóa mềm khỏi F1.5, không còn trên biểu đồ và không còn dùng để tính cảnh báo.
   - Buổi khám bị hủy không còn được tính khi xác định hạn khám định kỳ.
   - Trạng thái sức khỏe **không** tự quay về giá trị cũ; nếu cần, bác sĩ đổi lại bằng F3.7.
   - Bác sĩ có thể ghi ngay một buổi khám thay thế, buổi mới ghi rõ là thay cho buổi đã hủy.
   - Buổi tái khám hủy được kể cả khi bệnh án đã đóng; việc hủy không đổi chi phí hay kết luận cuối.
   - Buổi mở bệnh án chỉ hủy được khi bệnh án còn Đang điều trị và không còn buổi khám nào khác chưa hủy (trường hợp mở nhầm). Khi đó bệnh án chuyển trạng thái **Đã hủy**: không có chi phí, không tính vào tổng chi phí, lệnh khóa đang gắn được tách khỏi bệnh án (lệnh khóa giữ nguyên), hệ thống báo lại CLUB MANAGER và HORSE OWNER.
5. Thời điểm khám không được ở tương lai và chỉ được nhập lùi tối đa 7 ngày (đồng bộ với F1.5). Buổi khám trong bệnh án phải có thời điểm không sớm hơn thời điểm mở bệnh án.
6. "Buổi khám gần nhất" là buổi chưa bị hủy có **thời điểm khám** lớn nhất, không phải buổi được nhập sau cùng.

### 3. Chu kỳ khám định kỳ

1. Chu kỳ khám định kỳ cố định **30 ngày** cho toàn câu lạc bộ, là quy định của hệ thống. Không vai trò nào sửa được trên giao diện.
2. Mốc tính hạn = ngày muộn hơn giữa ngày của buổi khám gần nhất (cả ngoài lẫn trong bệnh án) và ngày tạo hồ sơ. Mục đích: ngựa mới tạo không bị báo quá hạn ngay lập tức.
   - Ngoại lệ kích hoạt lại (F1.8): ngựa **đã chuyển nhượng** được kích hoạt lại mà chưa có buổi khám nào từ ngày đó thì hạn khám **chính là ngày kích hoạt lại** (hiện ngay ở mục Đến hạn), vì ngựa đang ở trạng thái Cần theo dõi cho tới khi bác sĩ khám lại. Ngày kích hoạt lại lấy lần gần nhất, kể cả khi sau đó ngựa đã giải nghệ. Ngựa kích hoạt lại từ Đã giải nghệ giữ hạn khám cũ (buổi khám gần nhất + 30 ngày), vì vẫn được khám định kỳ trong thời gian giải nghệ. *(BA chốt)*
3. Hạn khám kế tiếp = mốc tính hạn + 30 ngày. Mọi ngày tính theo lịch Việt Nam (Asia/Ho_Chi_Minh), không tính theo giờ.
4. Con ngựa đang điều trị thường không bị quá hạn nếu bác sĩ tái khám đều, vì mỗi buổi tái khám đã đẩy hạn đi. Nếu bệnh án bị bỏ quên quá 30 ngày không có buổi khám nào thì ngựa vẫn bị báo quá hạn như bình thường, đây là tín hiệu đúng.
5. Ngựa ở trạng thái Đang hoạt động và Đã giải nghệ đều có lịch khám định kỳ. Ngựa Đã chuyển nhượng, Đã mất và hồ sơ đã xóa thì không.

### 4. Trạng thái sức khỏe và khóa huấn luyện

1. Bốn trạng thái sức khỏe và ý nghĩa của chúng được định nghĩa ở Flow 1, mục III.2. Chỉ VETERINARIAN đổi được giá trị này, qua Flow 3. Ngoại lệ do hệ thống tự đặt: giá trị khởi tạo khi tạo hồ sơ (F1.2) và giá trị "Cần theo dõi" khi kích hoạt lại (F1.8).
2. Mọi lần đổi trạng thái sức khỏe đều bắt buộc nhập lý do và ghi nhật ký kèm giá trị trước, sau.
3. Khóa huấn luyện là một lệnh riêng của bác sĩ, độc lập với trạng thái sức khỏe. Một con ngựa ở trạng thái Cần theo dõi vẫn có thể bị khóa, và ngược lại một con Đủ điều kiện cũng có thể đang bị khóa trong thời gian hồi phục. Hệ thống **cho phép** đặt Đủ điều kiện khi ngựa đang bị khóa.
4. Quy tắc tính "được tập" và "được đua" nằm ở Flow 1, mục III.4. Flow 3 chỉ cung cấp dữ liệu đầu vào, không tự tính lại.
5. Trạng thái Cách ly không bắt buộc hệ thống chuyển ngựa sang loại ô riêng. Nếu cần tách đàn, HEAD TRAINER chuyển ô bằng F1.7.

### 5. Chỉ số cơ thể

1. Số đo lấy trong buổi khám được ghi vào **ĐÚNG** bảng chỉ số cơ thể của F1.5, kèm nguồn "từ buổi khám X". Flow 3 không tạo bảng số đo riêng. Khoảng bình thường, xác nhận giá trị bất thường của F1.5 vẫn áp dụng.
2. Bản ghi có nguồn từ buổi khám không xóa được ở F1.5; muốn đính chính thì hủy buổi khám ở F3.6.
3. Cảnh báo tự động của F1.5 sinh yêu cầu khám (F3.4):
   - Sốt (thân nhiệt trên 38.6 độ C): yêu cầu mức **Khẩn**.
   - Sụt cân (giảm quá 5% trong 14 ngày): yêu cầu mức **Bình thường**.
4. Số đo lấy ngay trong buổi khám **không** sinh yêu cầu khám và **không** gửi cảnh báo của F1.5, vì bác sĩ đang khám chính con ngựa đó. Quyết định của bác sĩ (đổi sức khỏe, đặt khóa huấn luyện, mở bệnh án) đã có thông báo riêng theo mục III.7. *(BA chốt)*
5. Mỗi con ngựa chỉ có tối đa một yêu cầu tự động đang chờ cho mỗi loại cảnh báo. Cảnh báo lặp lại khi yêu cầu cũ còn chờ thì không sinh thêm yêu cầu.
6. Yêu cầu tự động không gửi thêm thông báo, vì cảnh báo của F1.5 đã báo cho VETERINARIAN và HEAD TRAINER.

### 6. Chi phí y tế

1. Mỗi bệnh án có **MỘT** trường chi phí duy nhất, nhập khi đóng bệnh án (F3.9). Hệ thống không ghi chi phí theo từng buổi khám, không theo từng loại thuốc, không có thanh toán.
2. Chi phí là số nguyên, đơn vị VND, không âm. Điều trị không mất tiền thì nhập 0.
3. Sau khi đóng, VETERINARIAN được điều chỉnh chi phí (ví dụ gõ nhầm), bắt buộc nhập lý do. Hệ thống ghi nhật ký giá trị trước, sau và báo lại cho chủ chịu khoản chi phí đó (mục 8). Không sửa đè im lặng.
4. Buổi khám định kỳ và buổi khám theo yêu cầu không có chi phí riêng, vì việc này thuộc gói chăm sóc mà chủ ngựa đã chọn (Flow 4).
5. Chủ ngựa chỉ nhìn thấy chi phí khi bệnh án đã đóng, đúng với góp ý của giảng viên là chỉ báo chi phí cuối cùng.
6. HEAD TRAINER không bao giờ thấy chi phí, vì chi phí là việc giữa câu lạc bộ và chủ ngựa, không phục vụ quyết định huấn luyện.
7. Tổng chi phí y tế của một con ngựa = tổng chi phí của các bệnh án đã đóng.
8. Chi phí của một bệnh án thuộc về người đang làm chủ ngựa lúc bệnh án được đóng (theo giai đoạn sở hữu ở F1.4; giai đoạn bắt đầu từ lúc CLUB MANAGER lưu việc chuyển chủ). Vì chuyển nhượng nội bộ bị chặn khi còn bệnh án đang mở, không bệnh án nào nằm vắt qua hai chủ.
   - Báo cáo chi phí lọc theo chủ chỉ cộng các bệnh án thuộc giai đoạn của chủ đó. Ví dụ: A sở hữu ngựa, bệnh án tháng 3 tốn 5 triệu; A bán cho B ngày 01/06; bệnh án tháng 8 tốn 3 triệu. Lọc A ra 5 triệu, lọc B ra 3 triệu.
   - Chủ ngựa xem bệnh án: bệnh án thuộc giai đoạn của chủ khác vẫn hiện đủ nội dung (lịch sử sức khỏe thuộc về con ngựa), nhưng chi phí bị ẩn và có đánh dấu "chi phí thuộc chủ trước". Tổng chi phí chủ ngựa thấy chỉ cộng các bệnh án thuộc mọi giai đoạn mình sở hữu.
   - Điều chỉnh chi phí sau khi đã chuyển chủ: báo cho chủ của giai đoạn chứa bệnh án. Người đó không còn là chủ hiện tại thì thông báo không mở được hồ sơ ngựa.
   - CLUB MANAGER và VETERINARIAN vẫn thấy đủ chi phí mọi bệnh án. HEAD TRAINER vẫn không thấy chi phí.

### 7. Thông báo

| Sự kiện | Mức | Người nhận |
|---|---|---|
| Yêu cầu khám mức Khẩn được tạo bởi người dùng, hoặc bác sĩ nâng một yêu cầu (kể cả yêu cầu tự động) lên Khẩn | URGENT | Mọi VETERINARIAN đang hoạt động |
| Đặt khóa huấn luyện | HIGH | HEAD TRAINER phụ trách khu, CLUB MANAGER |
| Trạng thái sức khỏe chuyển sang Chấn thương hoặc Cách ly | HIGH | HEAD TRAINER phụ trách khu, CLUB MANAGER, HORSE OWNER |
| Trạng thái sức khỏe chuyển sang Cần theo dõi (ngựa bị cấm đua) *(BA chốt)* | NORMAL | HEAD TRAINER phụ trách khu |
| Quá hạn khám định kỳ trên 7 ngày | HIGH | Mọi VETERINARIAN đang hoạt động, CLUB MANAGER |
| Mở bệnh án | NORMAL | CLUB MANAGER, HORSE OWNER |
| Gỡ khóa huấn luyện do bác sĩ | NORMAL | HEAD TRAINER phụ trách khu, CLUB MANAGER |
| Đóng bệnh án | NORMAL | HORSE OWNER, CLUB MANAGER |
| Hủy bệnh án mở nhầm | NORMAL | CLUB MANAGER, HORSE OWNER |
| Điều chỉnh chi phí bệnh án đã đóng | NORMAL | HORSE OWNER của giai đoạn chứa bệnh án (III.6.8), CLUB MANAGER |
| Lịch chăm sóc định kỳ đến hạn (F3.11) | NORMAL | Mọi VETERINARIAN đang hoạt động, người được giao (nếu còn hợp lệ, xem F3.11 mục 1) |

1. Ngựa chưa được xếp khu thì không có HEAD TRAINER nhận thông báo, khi đó chỉ gửi cho các vai trò còn lại.
2. Ngựa chưa có chủ, hoặc chủ không còn là tài khoản HORSE OWNER đang hoạt động, thì bỏ qua người nhận HORSE OWNER.
3. Gỡ khóa do chuyển nhượng hoặc do ngựa mất không gửi thông báo riêng; hệ quả này đã nằm trong nhật ký đổi vòng đời của F1.8.
4. Thông báo quá hạn khám và lịch chăm sóc đến hạn do hệ thống kiểm tra mỗi ngày một lần. Mỗi con ngựa chỉ nhận một thông báo cho mỗi hạn; khám xong thì hạn mới được tính và có thể báo lại khi hạn mới quá.

### 8. Phụ thuộc giữa các flow

| Flow | Flow 3 nhận gì / cung cấp gì |
|---|---|
| Flow 1 | Nhận hồ sơ ngựa, khu và ô chuồng, HEAD TRAINER phụ trách khu. Ghi số đo vào bảng chỉ số cơ thể của F1.5. Cung cấp trạng thái sức khỏe, khóa huấn luyện, danh sách bệnh án và tổng chi phí để hiển thị trong F1.3. Khi chuyển nhượng (F1.8): chặn nếu ngựa còn bệnh án đang mở; yêu cầu khám đang chờ tự chuyển Đã bỏ qua với lý do "Do chuyển nhượng"; lịch hẹn khám định kỳ và lịch chăm sóc (F3.11) chưa làm tự hủy; khóa huấn luyện tự gỡ. Khi ghi nhận ngựa mất (F1.8): làm giống vậy với lý do "Do ngựa mất" và "Gỡ do ngựa mất". Bác sĩ đóng bệnh án kèm ngày mất (F3.9) thì ngựa được ghi nhận mất trong cùng thao tác. Chuyển nhượng nội bộ (F1.4) cũng bị chặn khi còn bệnh án đang mở. Các hệ quả này nằm trong dòng nhật ký đổi vòng đời. Bệnh án và yêu cầu khám cũng là dữ liệu chặn xóa hồ sơ. |
| Flow 2 | Cung cấp trạng thái sức khỏe và khóa huấn luyện để Flow 2 chặn việc đăng ký lớp và tham gia buổi tập. Flow 3 không tự rút ngựa khỏi lớp. |
| Flow 4 | Nhận báo cáo sự cố của GROOM dưới dạng yêu cầu khám khi sự cố khẩn hoặc HEAD TRAINER chuyển bác sĩ. Cung cấp ghi chú chăm sóc và hạn chế vận động (trường "Ghi chú chăm sóc" của buổi khám gần nhất) để Flow 4 điều chỉnh khẩu phần và checklist. |
| Flow 5 | Cung cấp giá trị "được đua" để Flow 5 chặn đăng ký thi đấu. Flow 3 không tự rút đăng ký thi đấu đã có; Flow 5 kiểm tra lại "được đua" khi chốt danh sách. |

---

## F3.1 — Xem bảng điều khiển y tế (Xem)

### Mô tả

Màn hình riêng cho công việc y tế, đúng yêu cầu của giảng viên về một màn hình y tế tách biệt. Gom bốn nhóm thông tin mà bác sĩ cần nhìn mỗi ngày: tình trạng sức khỏe của cả đàn, lịch khám định kỳ đến hạn, bệnh án đang mở và các yêu cầu khám chờ xử lý.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Xem | Toàn câu lạc bộ | Vai trò chính sử dụng màn hình này. |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Xem để nắm tình hình, không thao tác y tế. |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Dùng để biết con nào không tập được. |
| GROOM | Không | | Xem trạng thái sức khỏe trong hồ sơ ngựa (F1.3). |
| HORSE OWNER | Không | | Xem phần của ngựa mình tại F3.10. |

### Nghiệp vụ

1. Màn hình gồm bốn khối:
   - Sơ đồ đàn ngựa theo trạng thái sức khỏe trên chuồng trại: đếm số lượng theo từng mức, mỗi con kèm khu và ô chuồng đang xếp để vẽ theo khu và ô; ngựa chưa có ô gom vào nhóm "Chưa xếp ô".
   - Lịch khám định kỳ: các con đến hạn trong 3 ngày tới và các con đã quá hạn.
   - Bệnh án đang mở, kèm ngày khám gần nhất và ngày hẹn tái khám.
   - Yêu cầu khám đang chờ xử lý, xếp yêu cầu Khẩn lên trước.
2. Thứ tự ưu tiên trong sơ đồ đàn: Cách ly và Chấn thương lên đầu, rồi Cần theo dõi, cuối cùng là Đủ điều kiện.
3. Bộ lọc theo khu chuồng và theo trạng thái sức khỏe. Số đếm bốn mức của sơ đồ đàn chỉ theo bộ lọc khu; lọc trạng thái sức khỏe chỉ thu hẹp danh sách ngựa và ba khối còn lại.
4. Bấm vào một con ngựa mở hồ sơ chi tiết (F1.3) hoặc bệnh án (F3.10).
5. Không hiển thị ngựa đã chuyển nhượng, đã mất và hồ sơ đã xóa.
6. Số liệu tính trực tiếp khi mở màn hình, không lưu lại.
7. Màn hình không có thông tin chi phí.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-01 |
| **Tên use case** | Xem bảng điều khiển y tế |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | CLUB MANAGER, HEAD TRAINER (chỉ xem) |
| **Tiền điều kiện** | Người dùng đã đăng nhập và có vai trò được phép xem. |
| **Hậu điều kiện** | Bốn khối thông tin y tế được hiển thị theo đúng phạm vi quyền. |
| **Luồng sự kiện chính** | 1. Người dùng chọn menu "Y tế".<br>2. Hệ thống xác định vai trò và phạm vi dữ liệu.<br>3. Hệ thống tính số liệu của bốn khối.<br>4. Hệ thống sắp xếp các con cần xử lý gấp lên đầu và hiển thị.<br>5. Người dùng xem và chọn công việc cần làm. |
| **Luồng thay thế** | A1. Người dùng lọc theo khu hoặc theo trạng thái sức khỏe -> hệ thống tính lại danh sách.<br>A2. Người dùng bấm vào một con ngựa -> hệ thống mở hồ sơ hoặc bệnh án tương ứng. |
| **Luồng ngoại lệ** | E1. Không có dữ liệu trong một khối -> hiển thị khối trống kèm dòng giải thích.<br>E2. GROOM hoặc HORSE OWNER gọi trực tiếp API -> trả về 403 (menu không hiển thị với hai vai trò này). |

---

## F3.2 — Quản lý lịch khám định kỳ (Xem, Sửa)

### Mô tả

Theo dõi hạn khám định kỳ của từng con ngựa và đặt ngày hẹn khám cụ thể. Đây là điểm khởi đầu của luồng khám định kỳ.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Xem, Sửa | Toàn câu lạc bộ | Đặt và dời ngày hẹn khám. |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Xem để tránh xếp buổi tập trùng giờ khám. |
| GROOM | Không | | |
| HORSE OWNER | Không | | |

### Nghiệp vụ

1. Chu kỳ khám và cách tính hạn theo mục III.3.
2. Ba trạng thái hạn khám, với "số ngày còn lại" = hạn khám − hôm nay:
   - Còn hạn: còn trên 3 ngày.
   - Đến hạn: còn từ 0 đến 3 ngày.
   - Quá hạn: số ngày còn lại nhỏ hơn 0.
3. VETERINARIAN đặt ngày hẹn khám cụ thể cho một con ngựa:
   - Ngày hẹn không được ở quá khứ.
   - Nếu ngựa chưa quá hạn thì ngày hẹn không được muộn hơn hạn khám. Nếu ngựa đã quá hạn thì chọn ngày bất kỳ từ hôm nay trở đi.
   - Mỗi con ngựa có tối đa một ngày hẹn đang hiệu lực.
4. Ngày hẹn chỉ là kế hoạch, hệ thống không tự tạo buổi khám khi đến ngày. Khi ghi một buổi khám bất kỳ cho con ngựa (F3.3 hoặc F3.6), ngày hẹn đang hiệu lực được đánh dấu Đã thực hiện.
5. Dời ngày hẹn bắt buộc nhập lý do.
6. Quá hạn trên 7 ngày: hệ thống gửi thông báo mức HIGH theo mục III.7.
7. Ngựa đang có bệnh án mở vẫn hiện trong danh sách và vẫn có hạn khám.
8. Không tính hạn khám cho ngựa đã chuyển nhượng, đã mất và hồ sơ đã xóa. Khi ngựa chuyển nhượng hoặc được ghi nhận mất, ngày hẹn đang hiệu lực tự hủy.
9. Ghi nhật ký khi đặt, dời ngày hẹn khám.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-02 |
| **Tên use case** | Quản lý lịch khám định kỳ |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | Hệ thống (tính hạn, gửi thông báo) |
| **Tiền điều kiện** | VETERINARIAN đã đăng nhập. |
| **Hậu điều kiện** | Danh sách hạn khám được hiển thị đúng. Ngày hẹn khám được lưu và ghi nhật ký. |
| **Luồng sự kiện chính** | 1. VETERINARIAN mở mục "Lịch khám định kỳ".<br>2. Hệ thống tính hạn khám của từng con ngựa.<br>3. Hệ thống xếp các con quá hạn lên đầu, rồi tới các con đến hạn.<br>4. VETERINARIAN chọn một con và đặt ngày hẹn khám.<br>5. Hệ thống lưu và ghi nhật ký. |
| **Luồng thay thế** | A1. VETERINARIAN dời ngày hẹn đã đặt -> hệ thống lưu ngày mới kèm lý do.<br>A2. Ngựa vừa được khám (trong hoặc ngoài bệnh án) -> hạn khám tự đẩy sang chu kỳ tiếp theo, ngày hẹn đang hiệu lực chuyển Đã thực hiện. |
| **Luồng ngoại lệ** | E1. Đặt ngày hẹn trong quá khứ, hoặc muộn hơn hạn khám khi ngựa chưa quá hạn -> báo lỗi.<br>E2. Đặt lịch cho ngựa đã chuyển nhượng hoặc đã mất -> không hiện nút thao tác; gọi trực tiếp API trả về 409. Hồ sơ đã xóa -> 404 (CLUB MANAGER: 409) theo quy ước Flow 1.<br>E3. Dời lịch không nhập lý do -> báo lỗi. |

---

## F3.3 — Ghi nhận buổi khám ngoài bệnh án (Thêm, Xem)

### Mô tả

Ghi lại một buổi khám cho con ngựa chưa có bệnh án đang mở: khám định kỳ theo lịch, hoặc khám theo yêu cầu khi ngựa có dấu hiệu bất thường. Nếu buổi khám phát hiện vấn đề, bệnh án được mở ngay trong cùng thao tác lưu.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Thêm, Xem | Toàn câu lạc bộ | Vai trò duy nhất ghi nhận buổi khám. |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | |
| GROOM | Không | | |
| HORSE OWNER | Xem | Ngựa sở hữu | Không thấy liều lượng và tần suất của đơn thuốc. |

### Nghiệp vụ

1. Một buổi khám ngoài bệnh án gồm:
   - Loại: Định kỳ hoặc Theo yêu cầu.
   - Ngày giờ khám và bác sĩ thực hiện.
   - Các yêu cầu khám đang chờ của con ngựa được gắn vào buổi này (bắt buộc ít nhất một với loại Theo yêu cầu, tùy chọn với loại Định kỳ).
   - Các chỉ số cơ thể đo được, ghi vào bảng chỉ số của F1.5 kèm nguồn.
   - Chẩn đoán, nhận xét: ô văn bản tự do.
   - Kết luận: Bình thường hoặc Có vấn đề.
   - Trạng thái sức khỏe sau khám (tùy chọn; nếu khác trạng thái hiện tại thì bắt buộc lý do, theo F3.7).
   - Ghi chú chăm sóc: hạn chế vận động, lưu ý cho GROOM (tùy chọn). Ghi chú của buổi khám gần nhất là ghi chú đang hiệu lực; để trống nghĩa là không còn hạn chế. Giao diện điền sẵn ghi chú đang hiệu lực để bác sĩ giữ, sửa hoặc xóa có chủ đích.
   - Đơn thuốc (tùy chọn): mỗi dòng gồm tên thuốc, liều lượng, tần suất, ngày bắt đầu, ngày kết thúc (tùy chọn, không sớm hơn ngày bắt đầu). Không trừ kho, không tính tiền.
   - Chấn thương (tùy chọn, chỉ khi kết luận Có vấn đề): theo F3.6 mục 2.
   - Ngày hẹn tái khám (tùy chọn, chỉ khi kết luận Có vấn đề): là ngày hẹn tái khám đầu tiên của bệnh án vừa mở.
2. Kết luận Bình thường: hệ thống lưu buổi khám như một bản ghi độc lập, không mở bệnh án, và đẩy hạn khám định kỳ sang chu kỳ tiếp theo.
3. Kết luận Có vấn đề: bắt buộc nhập chẩn đoán ban đầu của bệnh án. Hệ thống lưu buổi khám và mở bệnh án (F3.5) trong cùng một thao tác; buổi khám trở thành buổi đầu tiên của bệnh án.
4. Các yêu cầu khám được gắn chuyển sang Đã khám. Chỉ gắn được yêu cầu đang chờ của chính con ngựa đó.
5. Nếu con ngựa đã có bệnh án đang mở, hệ thống không cho tạo buổi khám ngoài bệnh án mà hướng bác sĩ sang F3.6 để ghi buổi khám vào bệnh án đó.
6. Thời điểm khám theo mục III.2.5.
7. Không ghi nhận buổi khám cho ngựa đã chuyển nhượng, đã mất hoặc hồ sơ đã xóa. Ngựa đã giải nghệ vẫn khám bình thường.
8. Buổi khám đã lưu không sửa, không xóa; ghi sai thì hủy theo F3.6.
9. Ghi nhật ký thao tác.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-03 |
| **Tên use case** | Ghi nhận buổi khám ngoài bệnh án |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | Hệ thống (ghi chỉ số, đẩy hạn khám, cập nhật yêu cầu khám, ghi nhật ký) |
| **Tiền điều kiện** | VETERINARIAN đã đăng nhập. Con ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ và chưa có bệnh án đang mở. |
| **Hậu điều kiện** | Buổi khám được lưu, chỉ số cơ thể được ghi vào F1.5, hạn khám định kỳ được đẩy sang chu kỳ tiếp theo, các yêu cầu được gắn chuyển Đã khám. Nếu kết luận Có vấn đề thì có thêm một bệnh án đang mở. |
| **Luồng sự kiện chính** | 1. VETERINARIAN chọn con ngựa từ lịch khám định kỳ hoặc từ hàng đợi yêu cầu khám.<br>2. Hệ thống hiển thị biểu mẫu buổi khám và danh sách yêu cầu khám đang chờ của con ngựa.<br>3. VETERINARIAN gắn yêu cầu (nếu có), nhập chỉ số cơ thể, nhận xét, kết luận và trạng thái sức khỏe.<br>4. VETERINARIAN lưu.<br>5. Hệ thống ghi chỉ số vào F1.5 kèm nguồn, lưu buổi khám, chuyển các yêu cầu sang Đã khám, đẩy hạn khám và ghi nhật ký. |
| **Luồng thay thế** | A1. Kết luận Có vấn đề -> VETERINARIAN nhập chẩn đoán ban đầu, hệ thống mở bệnh án ngay trong thao tác lưu (UC-F3-05).<br>A2. Trạng thái sức khỏe thay đổi -> hệ thống thực hiện các hệ quả của UC-F3-07.<br>A3. Chỉ số ngoài khoảng bình thường -> hệ thống hỏi xác nhận theo F1.5; không sinh yêu cầu khám tự động. |
| **Luồng ngoại lệ** | E1. Con ngựa đã có bệnh án đang mở -> trả về 409 và hướng sang UC-F3-06.<br>E2. Ngựa đã chuyển nhượng hoặc đã mất -> không hiện nút thao tác; gọi trực tiếp API trả về 409. Hồ sơ đã xóa -> 404 (CLUB MANAGER: 409) theo quy ước Flow 1.<br>E3. Thời điểm khám ở tương lai hoặc lùi quá 7 ngày -> báo lỗi.<br>E4. Kết luận Có vấn đề mà không nhập chẩn đoán ban đầu -> báo lỗi.<br>E5. Yêu cầu được gắn không còn ở trạng thái Chờ xử lý (người khác vừa xử lý) -> trả về 409, không lưu gì. |

---

## F3.4 — Tiếp nhận yêu cầu khám khi ngựa có vấn đề (Thêm, Sửa, Xem)

### Mô tả

Hàng đợi các yêu cầu khám phát sinh ngoài lịch định kỳ. Đây là điểm khởi đầu của luồng khám theo yêu cầu.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Thêm, Sửa, Xem | Toàn câu lạc bộ | Xử lý hàng đợi: khám (F3.3, F3.6) hoặc bỏ qua kèm lý do; đổi mức độ. |
| GROOM | Xem | Ngựa được phân công | Không gửi trực tiếp; yêu cầu sinh từ sự cố khẩn hoặc khi HEAD TRAINER chuyển bác sĩ (Flow 4). |
| HEAD TRAINER | Thêm, Xem | Thêm: ngựa thuộc khu phụ trách. Xem: toàn câu lạc bộ | Gửi yêu cầu khi thấy ngựa bất thường trong buổi tập. |
| CLUB MANAGER | Thêm, Xem | Toàn câu lạc bộ | Là người duy nhất gửi được yêu cầu cho ngựa chưa xếp khu, ngoài VETERINARIAN. |
| HORSE OWNER | Không | | Đề nghị qua câu lạc bộ. |

### Nghiệp vụ

1. Một yêu cầu khám gồm: con ngựa, người gửi, thời điểm gửi, mô tả dấu hiệu, mức độ (Bình thường hoặc Khẩn) và nguồn gốc. Bốn nguồn gốc:
   - Báo cáo sự cố của GROOM (Flow 4): sự cố khẩn, hoặc HEAD TRAINER chuyển bác sĩ.
   - Cảnh báo tự động từ chỉ số cơ thể (F1.5), theo mục III.5. Người gửi ghi là Hệ thống.
   - HEAD TRAINER hoặc CLUB MANAGER gửi tay.
   - VETERINARIAN tự tạo.
2. Yêu cầu có ba trạng thái: Chờ xử lý, Đã khám, Đã bỏ qua. Đã khám và Đã bỏ qua là trạng thái cuối, không mở lại.
3. Chỉ VETERINARIAN chuyển trạng thái. Người gửi không tự hủy được yêu cầu; gửi nhầm thì báo bác sĩ bỏ qua.
4. Bỏ qua bắt buộc nhập lý do.
5. VETERINARIAN được đổi mức độ của yêu cầu đang chờ, bắt buộc nhập lý do.
6. Yêu cầu mức Khẩn do người dùng tạo sinh thông báo URGENT cho mọi VETERINARIAN ngay khi được tạo. Yêu cầu tự động không gửi thêm thông báo lúc tạo (mục III.5.6). Khi bác sĩ nâng một yêu cầu bất kỳ (kể cả yêu cầu tự động) lên Khẩn, hệ thống cũng gửi URGENT cho mọi VETERINARIAN.
7. Một con ngựa có thể có nhiều yêu cầu đang chờ. Khi khám, bác sĩ gắn một hoặc nhiều yêu cầu vào cùng một buổi khám và tất cả cùng chuyển sang Đã khám.
8. Khi ngựa chuyển nhượng, mọi yêu cầu đang chờ tự chuyển Đã bỏ qua với lý do "Do chuyển nhượng"; khi ghi nhận ngựa mất thì lý do là "Do ngựa mất".
9. Không tạo yêu cầu (kể cả yêu cầu tự động từ cảnh báo chỉ số) cho ngựa đã chuyển nhượng, đã mất hoặc hồ sơ đã xóa.
10. Ghi nhật ký khi tạo, khi đổi mức độ, khi bỏ qua và khi gắn yêu cầu vào buổi khám.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-04 |
| **Tên use case** | Tiếp nhận yêu cầu khám khi ngựa có vấn đề |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | HEAD TRAINER, CLUB MANAGER (gửi yêu cầu), Hệ thống (sinh yêu cầu từ cảnh báo và từ sự cố của GROOM) |
| **Tiền điều kiện** | Người gửi đã đăng nhập và con ngựa nằm trong phạm vi của họ. |
| **Hậu điều kiện** | Yêu cầu khám được lưu ở trạng thái Chờ xử lý, hoặc được chuyển sang Đã khám / Đã bỏ qua. |
| **Luồng sự kiện chính** | 1. Người gửi mô tả dấu hiệu bất thường và chọn mức độ.<br>2. Hệ thống lưu yêu cầu ở trạng thái Chờ xử lý và gửi thông báo nếu là mức Khẩn.<br>3. VETERINARIAN mở hàng đợi yêu cầu.<br>4. VETERINARIAN chọn một yêu cầu và bắt đầu buổi khám: UC-F3-03 nếu ngựa chưa có bệnh án mở, UC-F3-06 nếu đã có.<br>5. Hệ thống chuyển yêu cầu sang Đã khám và ghi nhật ký. |
| **Luồng thay thế** | A1. Chỉ số cơ thể vượt ngưỡng -> hệ thống tự tạo yêu cầu, không cần người gửi.<br>A2. VETERINARIAN thấy yêu cầu không cần khám -> bỏ qua kèm lý do.<br>A3. Nhiều yêu cầu của cùng một con ngựa -> gắn tất cả vào một buổi khám.<br>A4. VETERINARIAN đổi mức độ -> nhập lý do, hệ thống lưu và ghi nhật ký. |
| **Luồng ngoại lệ** | E1. Không nhập mô tả -> báo lỗi.<br>E2. GROOM gọi gửi yêu cầu, HEAD TRAINER gửi cho ngựa ngoài khu -> trả về 403.<br>E3. Ngựa đã chuyển nhượng hoặc đã mất -> không cho tạo yêu cầu (409). Riêng HEAD TRAINER và GROOM: ngựa đã chuyển nhượng hoặc đã mất không còn thuộc khu hay phân công của họ nên nhận 403, không lộ tình trạng con ngựa. *(BA chốt)* Hồ sơ đã xóa -> 404 (CLUB MANAGER: 409).<br>E4. Bỏ qua hoặc đổi mức độ một yêu cầu không còn Chờ xử lý -> trả về 409. |

---

## F3.5 — Mở bệnh án (Thêm)

### Mô tả

Tạo một bệnh án cho con ngựa khi buổi khám ngoài bệnh án phát hiện vấn đề cần theo dõi hoặc điều trị. Bệnh án là nơi gom nhiều buổi khám của cùng một vấn đề, đúng yêu cầu của giảng viên. Bệnh án không mở riêng lẻ mà là hệ quả của F3.3 khi kết luận Có vấn đề.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Thêm | Toàn câu lạc bộ | Vai trò duy nhất mở bệnh án. |
| CLUB MANAGER | Không | | Xem bệnh án tại F3.10. |
| HEAD TRAINER | Không | | Đề nghị khám qua F3.4. |
| GROOM | Không | | |
| HORSE OWNER | Không | | |

### Nghiệp vụ

1. Một bệnh án gồm: con ngựa, ngày mở (bằng thời điểm của buổi khám mở bệnh án), bác sĩ mở, chẩn đoán ban đầu, trạng thái (Đang điều trị, Đã đóng, hoặc Đã hủy khi mở nhầm, xem III.2.4), danh sách buổi khám, kết luận cuối và tổng chi phí. Hai trường cuối chỉ có giá trị khi bệnh án đã đóng.
2. Mỗi con ngựa có tối đa **MỘT** bệnh án đang mở. Nếu đã có, hệ thống chặn với mã 409 và hướng bác sĩ sang bệnh án hiện có để thêm buổi khám.
3. Bệnh án luôn được mở từ một buổi khám ngoài bệnh án có kết luận Có vấn đề, không mở rỗng. Buổi khám đó trở thành buổi đầu tiên của bệnh án.
4. Ngựa đã giải nghệ vẫn mở bệnh án được. Ngựa đã chuyển nhượng, đã mất và hồ sơ đã xóa thì không.
5. Mở bệnh án không tự động đổi trạng thái sức khỏe và không tự đặt khóa huấn luyện. Hai việc đó do bác sĩ quyết định ở F3.7 và F3.8. Nếu con ngựa đang có lệnh khóa chưa gắn bệnh án nào, lệnh khóa được gắn vào bệnh án vừa mở.
6. Gửi thông báo mức NORMAL cho CLUB MANAGER và HORSE OWNER của con ngựa.
7. Ghi nhật ký thao tác.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-05 |
| **Tên use case** | Mở bệnh án |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | Hệ thống (gửi thông báo, ghi nhật ký) |
| **Tiền điều kiện** | VETERINARIAN đang ghi nhận một buổi khám ngoài bệnh án với kết luận Có vấn đề. Con ngựa chưa có bệnh án đang mở, ở trạng thái Đang hoạt động hoặc Đã giải nghệ, và hồ sơ chưa bị xóa. |
| **Hậu điều kiện** | Bệnh án được tạo ở trạng thái Đang điều trị, với buổi khám vừa ghi là buổi đầu tiên. |
| **Luồng sự kiện chính** | 1. VETERINARIAN chọn kết luận Có vấn đề trong biểu mẫu F3.3.<br>2. VETERINARIAN nhập chẩn đoán ban đầu.<br>3. VETERINARIAN lưu buổi khám.<br>4. Hệ thống kiểm tra con ngựa chưa có bệnh án đang mở.<br>5. Hệ thống lưu buổi khám, tạo bệnh án và gắn buổi khám làm buổi đầu tiên trong cùng một thao tác.<br>6. Hệ thống gửi thông báo và ghi nhật ký. |
| **Luồng thay thế** | A1. Bác sĩ muốn khóa huấn luyện ngay -> thực hiện tiếp UC-F3-08, lệnh khóa tự gắn vào bệnh án.<br>A2. Bác sĩ muốn đổi trạng thái sức khỏe -> chọn trạng thái sau khám ngay trong biểu mẫu, hoặc thực hiện tiếp UC-F3-07. |
| **Luồng ngoại lệ** | E1. Con ngựa đã có bệnh án đang mở (ví dụ bác sĩ khác vừa mở) -> trả về 409, không lưu buổi khám; bác sĩ ghi lại vào bệnh án hiện có.<br>E2. Không nhập chẩn đoán ban đầu -> báo lỗi.<br>E3. Lưu thất bại giữa chừng -> hủy toàn bộ, không có buổi khám nào được lưu. |

---

## F3.6 — Ghi nhận buổi khám trong bệnh án và hủy buổi khám ghi sai (Thêm, Xem, Sửa)

### Mô tả

Ghi lại từng lần bác sĩ tái khám con ngựa trong quá trình điều trị. Một bệnh án có nhiều buổi khám, mỗi buổi là một bản ghi riêng và không sửa được sau khi lưu. Buổi khám ghi sai (ở F3.3 hoặc F3.6) được hủy kèm lý do tại đây.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Thêm, Xem, Sửa (hủy) | Toàn câu lạc bộ | Vai trò duy nhất ghi nhận và hủy buổi khám. |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Xem chẩn đoán, ghi chú chăm sóc và hạn chế vận động để sắp lịch tập. |
| GROOM | Xem ghi chú chăm sóc | Ngựa được phân công | Xem ghi chú chăm sóc đang hiệu lực (của buổi khám gần nhất) ngay trong hồ sơ ngựa. Không xem được chẩn đoán, thuốc hay chi phí. *(BA chốt)* |
| HORSE OWNER | Xem | Ngựa sở hữu | Không thấy liều lượng, tần suất của đơn thuốc; không thấy chi phí cho tới khi bệnh án đóng; không thấy chi phí của bệnh án thuộc giai đoạn chủ khác (III.6.8). |

### Nghiệp vụ

1. Một buổi khám trong bệnh án gồm:
   - Ngày giờ khám và bác sĩ thực hiện.
   - Các yêu cầu khám đang chờ được gắn vào buổi này (nếu có).
   - Các chỉ số cơ thể đo được, ghi vào bảng chỉ số của F1.5 kèm nguồn.
   - Chẩn đoán và hướng điều trị: một ô văn bản tự do.
   - Trạng thái sức khỏe sau khám (tùy chọn; nếu khác trạng thái hiện tại thì bắt buộc lý do).
   - Ghi chú chăm sóc: hạn chế vận động, lưu ý cho GROOM (tùy chọn). Ghi chú của buổi khám gần nhất là ghi chú đang hiệu lực; để trống nghĩa là không còn hạn chế (giao diện điền sẵn ghi chú đang hiệu lực).
   - Ngày hẹn tái khám (tùy chọn).
   - Đơn thuốc (tùy chọn), cùng quy cách với F3.3.
   - Chấn thương (tùy chọn), xem mục 2.
2. Chấn thương: mỗi dòng gồm vùng cơ thể, vị trí trên mô hình 3D (tọa độ, tùy chọn), loại chấn thương, mức hồi phục (Cấp tính, Đang hồi phục, Đã lành) và ghi chú. Một chấn thương được định danh bằng cặp (vùng cơ thể, loại chấn thương) trong một bệnh án; mỗi buổi khám ghi tối đa một dòng cho mỗi cặp. Diễn biến hồi phục của một chấn thương là chuỗi các dòng cùng cặp của những buổi khám chưa hủy trong cùng bệnh án, xếp theo thời điểm khám.
3. Hệ thống không trừ kho vật tư và không tính tiền thuốc.
4. Chỉ ghi được buổi khám vào bệnh án đang ở trạng thái Đang điều trị.
5. Thời điểm khám theo mục III.2.5 (không sớm hơn ngày mở bệnh án).
6. Mỗi buổi khám (chưa bị hủy) đều đẩy hạn khám định kỳ của con ngựa sang chu kỳ tiếp theo.
7. Ngày hẹn tái khám hiển thị trong bảng điều khiển y tế (F3.1) để bác sĩ không quên. Ngày hẹn tái khám không được ở quá khứ, so theo ngày lịch câu lạc bộ (hẹn "hôm nay" là hợp lệ).
8. **Hủy buổi khám ghi sai** (áp dụng cho buổi khám của F3.3 và F3.6), theo mục III.2.4:
   - Chỉ VETERINARIAN, bắt buộc nhập lý do.
   - Không hủy lại buổi đã hủy. Buổi tái khám hủy được kể cả khi bệnh án đã đóng.
   - Buổi mở bệnh án chỉ hủy được khi bệnh án còn Đang điều trị và không còn buổi khám nào khác chưa hủy; khi đó bệnh án chuyển Đã hủy (III.2.4).
   - Các yêu cầu khám đã gắn vào buổi bị hủy giữ nguyên trạng thái Đã khám.
   - Bác sĩ có thể ghi ngay buổi khám thay thế; buổi thay thế theo đúng quy tắc của F3.3 hoặc F3.6.
9. Ghi nhật ký thao tác.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-06 |
| **Tên use case** | Ghi nhận buổi khám trong bệnh án và hủy buổi khám ghi sai |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | Hệ thống (ghi chỉ số, đẩy hạn khám, ghi nhật ký) |
| **Tiền điều kiện** | VETERINARIAN đã đăng nhập. Ghi buổi khám: con ngựa có một bệnh án đang ở trạng thái Đang điều trị. |
| **Hậu điều kiện** | Buổi khám được thêm vào bệnh án, chỉ số cơ thể được ghi vào F1.5, các yêu cầu khám liên quan chuyển sang Đã khám. Hoặc buổi khám ghi sai được đánh dấu Đã hủy và số đo của nó bị gỡ khỏi F1.5. |
| **Luồng sự kiện chính** | 1. VETERINARIAN mở bệnh án đang điều trị.<br>2. VETERINARIAN chọn "Thêm buổi khám".<br>3. Hệ thống hiển thị biểu mẫu và danh sách yêu cầu khám đang chờ của con ngựa.<br>4. VETERINARIAN gắn yêu cầu, nhập chỉ số, chẩn đoán và hướng điều trị, đơn thuốc, chấn thương, trạng thái sức khỏe.<br>5. VETERINARIAN lưu.<br>6. Hệ thống ghi chỉ số vào F1.5, lưu buổi khám, đẩy hạn khám định kỳ và ghi nhật ký. |
| **Luồng thay thế** | A1. Bác sĩ đặt ngày hẹn tái khám -> hệ thống hiển thị ngày hẹn trong bảng điều khiển.<br>A2. Trạng thái sức khỏe thay đổi -> hệ thống thực hiện hệ quả của UC-F3-07.<br>A3. Bác sĩ thấy đã khỏi -> chuyển sang UC-F3-09 để đóng bệnh án.<br>A4. Bác sĩ phát hiện một buổi khám ghi sai -> chọn "Hủy buổi khám", nhập lý do; hệ thống đánh dấu Đã hủy, gỡ số đo khỏi F1.5, ghi nhật ký; bác sĩ có thể ghi buổi thay thế.<br>A5. Bác sĩ mở nhầm bệnh án (chưa có buổi tái khám) -> hủy buổi mở bệnh án; bệnh án chuyển Đã hủy và báo lại CLUB MANAGER, HORSE OWNER. |
| **Luồng ngoại lệ** | E1. Bệnh án đã đóng -> trả về 409, phải khám ngoài bệnh án (F3.3) và mở bệnh án mới nếu có vấn đề.<br>E2. Thời điểm khám ở tương lai, lùi quá 7 ngày hoặc sớm hơn ngày mở bệnh án -> báo lỗi.<br>E3. Ngày hẹn tái khám ở quá khứ -> báo lỗi.<br>E4. Hủy buổi đã hủy, buổi mở bệnh án khi bệnh án còn buổi khác hoặc đã đóng -> trả về 409.<br>E5. Hủy không nhập lý do -> báo lỗi. |

---

## F3.7 — Cập nhật trạng thái sức khỏe (Sửa)

### Mô tả

Đổi trạng thái sức khỏe của một con ngựa giữa bốn mức. Đây là dữ liệu mà Flow 1, Flow 2 và Flow 5 đều dựa vào để quyết định con ngựa có được tập và được đua hay không.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Sửa | Toàn câu lạc bộ | Vai trò duy nhất đổi trạng thái sức khỏe. |
| CLUB MANAGER | Không | | Đây là kết luận chuyên môn y tế. |
| HEAD TRAINER | Không | | Đề nghị khám lại qua F3.4. |
| GROOM | Không | | Báo dấu hiệu bất thường qua Flow 4. |
| HORSE OWNER | Không | | |

### Nghiệp vụ

1. Hai cách đổi trạng thái, cả hai đều bắt buộc nhập lý do:
   - Trong một buổi khám (F3.3 hoặc F3.6): trạng thái sau khám là một trường của buổi khám.
   - Đổi trực tiếp từ hồ sơ ngựa hoặc bảng điều khiển y tế, không cần tạo buổi khám.
2. Bốn giá trị và ý nghĩa của chúng theo đúng Flow 1, mục III.2.
3. Hệ quả khi chuyển sang Chấn thương hoặc Cách ly:
   - Con ngựa không còn được tập và không còn được đua, do quy tắc tính ở Flow 1 mục III.4.
   - Hệ thống gửi thông báo mức HIGH cho HEAD TRAINER phụ trách khu, CLUB MANAGER và HORSE OWNER.
   - Hệ thống **KHÔNG** tự rút ngựa khỏi lớp học và không tự rút đăng ký thi đấu. Ngựa vẫn còn trong lớp nhưng không tham gia được buổi tập; HEAD TRAINER quyết định giữ hay rút.
   - Hệ thống không tự chuyển ô. Cần tách đàn thì HEAD TRAINER chuyển ô bằng F1.7 (Flow 1 mục III.2.2).
4. Chuyển sang Cần theo dõi: ngựa mất quyền đua và chỉ được tập cường độ Nhẹ và Trung bình (Flow 1 mục III.2); gửi thông báo mức NORMAL cho HEAD TRAINER phụ trách khu.
5. Chuyển sang Đủ điều kiện được phép cả khi đang có lệnh khóa huấn luyện, và không tự gỡ khóa. Khóa chỉ được gỡ ở F3.8.
6. Không đổi trạng thái cho ngựa đã chuyển nhượng, đã mất hoặc hồ sơ đã xóa.
7. Ghi nhật ký kèm giá trị trước, giá trị sau và lý do. Lịch sử trạng thái sức khỏe (F3.10) được dựng từ nhật ký này.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-07 |
| **Tên use case** | Cập nhật trạng thái sức khỏe |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | HEAD TRAINER, CLUB MANAGER (nhận thông báo), Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | VETERINARIAN đã đăng nhập. Con ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. |
| **Hậu điều kiện** | Trạng thái sức khỏe được cập nhật, các giá trị được tập và được đua được tính lại, thông báo được gửi nếu cần. |
| **Luồng sự kiện chính** | 1. VETERINARIAN mở hồ sơ ngựa hoặc bảng điều khiển y tế.<br>2. VETERINARIAN chọn "Đổi trạng thái sức khỏe".<br>3. Hệ thống hiển thị bốn giá trị kèm mô tả hệ quả.<br>4. VETERINARIAN chọn giá trị mới và nhập lý do.<br>5. Hệ thống lưu, gửi thông báo nếu cần và ghi nhật ký. |
| **Luồng thay thế** | A1. Trạng thái được đổi ngay trong một buổi khám -> hệ thống lưu cùng buổi khám, không cần thao tác riêng.<br>A2. Trạng thái mới trùng trạng thái cũ -> hệ thống không ghi nhật ký và báo không có thay đổi. |
| **Luồng ngoại lệ** | E1. Không nhập lý do -> chặn thao tác.<br>E2. Ngựa đã chuyển nhượng hoặc đã mất -> không hiện nút thao tác; gọi trực tiếp API trả về 409. Hồ sơ đã xóa -> 404 (CLUB MANAGER: 409) theo quy ước Flow 1.<br>E3. Vai trò khác VETERINARIAN gọi trực tiếp API -> trả về 403. |

---

## F3.8 — Đặt và gỡ khóa huấn luyện (Thêm, Xóa)

### Mô tả

Lệnh của bác sĩ ngăn một con ngựa tham gia huấn luyện và thi đấu, độc lập với trạng thái sức khỏe. Dùng cho những trường hợp ngựa chưa đến mức chấn thương nhưng vẫn cần nghỉ, hoặc đang hồi phục sau điều trị.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Thêm, Xóa | Toàn câu lạc bộ | Vai trò duy nhất đặt và gỡ khóa. |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Nhận thông báo khi ngựa bị khóa hoặc được gỡ khóa. |
| GROOM | Xem (hạn chế) | Toàn câu lạc bộ | Chỉ thấy nhãn "Đang bị khóa huấn luyện" trong hồ sơ ngựa (F1.3), không xem chi tiết và lịch sử khóa. |
| HORSE OWNER | Xem | Ngựa sở hữu | |

### Nghiệp vụ

1. Một lệnh khóa gồm: lý do, thời điểm bắt đầu (là lúc đặt khóa, không đặt trước cho tương lai), ngày dự kiến gỡ (tùy chọn), bệnh án liên quan (nếu có) và người đặt.
2. Nếu con ngựa đang có bệnh án mở, lệnh khóa tự gắn vào bệnh án đó.
3. Mỗi con ngựa có tối đa **MỘT** lệnh khóa đang hiệu lực.
4. Khóa chặn cả "được tập" và "được đua", bất kể trạng thái sức khỏe đang là gì.
5. Ngày dự kiến gỡ chỉ là thông tin tham khảo cho HEAD TRAINER. Hệ thống không tự gỡ khóa khi đến ngày, vì việc ngựa đã hồi phục hay chưa phải do bác sĩ xác nhận.
6. Gỡ khóa bắt buộc nhập lý do và chỉ VETERINARIAN thực hiện. Ngoại lệ duy nhất: khi ngựa được chuyển nhượng hoặc được ghi nhận mất, hệ thống tự gỡ khóa với ghi chú "Gỡ do chuyển nhượng" hoặc "Gỡ do ngựa mất" (xem F1.8); lịch sử khóa hiển thị người gỡ là "Hệ thống".
7. Khi đóng bệnh án mà lệnh khóa gắn với bệnh án đó vẫn còn hiệu lực, hệ thống bắt bác sĩ chọn một trong hai: gỡ khóa ngay, hoặc giữ khóa và nhập ngày dự kiến gỡ.
8. Thông báo theo mục III.7: mức HIGH khi đặt khóa và mức NORMAL khi bác sĩ gỡ khóa, gửi cho HEAD TRAINER phụ trách khu và CLUB MANAGER.
9. Không đặt khóa cho ngựa đã chuyển nhượng, đã mất hoặc hồ sơ đã xóa.
10. Ghi nhật ký cho cả thao tác đặt và gỡ.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-08 |
| **Tên use case** | Đặt và gỡ khóa huấn luyện |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | HEAD TRAINER, CLUB MANAGER (nhận thông báo), Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | VETERINARIAN đã đăng nhập. Con ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. |
| **Hậu điều kiện** | Lệnh khóa được tạo hoặc được gỡ. Giá trị được tập và được đua của con ngựa được tính lại. |
| **Luồng sự kiện chính** | 1. VETERINARIAN mở hồ sơ ngựa hoặc bệnh án.<br>2. VETERINARIAN chọn "Khóa huấn luyện".<br>3. VETERINARIAN nhập lý do và ngày dự kiến gỡ (nếu có).<br>4. Hệ thống kiểm tra con ngựa chưa có khóa đang hiệu lực.<br>5. Hệ thống lưu lệnh khóa (gắn bệnh án đang mở nếu có), gửi thông báo mức HIGH và ghi nhật ký. |
| **Luồng thay thế** | A1. VETERINARIAN gỡ khóa -> nhập lý do, hệ thống gỡ và gửi thông báo mức NORMAL.<br>A2. Đóng bệnh án mà khóa còn hiệu lực -> hệ thống yêu cầu chọn gỡ khóa hoặc giữ kèm ngày dự kiến gỡ. |
| **Luồng ngoại lệ** | E1. Con ngựa đã có khóa đang hiệu lực -> trả về 409 kèm câu thông báo; giao diện tải lại để hiện khóa hiện có. *(BA chốt)*<br>E2. Không nhập lý do -> chặn thao tác.<br>E3. Ngày dự kiến gỡ ở quá khứ (so theo ngày lịch câu lạc bộ) -> báo lỗi.<br>E4. Ngựa đã chuyển nhượng hoặc đã mất -> không hiện nút thao tác; gọi trực tiếp API trả về 409. Hồ sơ đã xóa -> 404 (CLUB MANAGER: 409) theo quy ước Flow 1.<br>E5. Gỡ một lệnh khóa đã gỡ -> trả về 409. |

---

## F3.9 — Đóng bệnh án, chốt và điều chỉnh chi phí (Sửa)

### Mô tả

Kết thúc một bệnh án khi con ngựa đã khỏi hoặc đã mất, ghi kết luận cuối và tổng chi phí điều trị. Đây là thời điểm chi phí được nhập và cũng là lúc chủ ngựa nhìn thấy chi phí. Sau khi đóng, chi phí chỉ được điều chỉnh kèm lý do.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Sửa | Toàn câu lạc bộ | Vai trò duy nhất đóng bệnh án, nhập và điều chỉnh chi phí. |
| CLUB MANAGER | Không | | Xem chi phí sau khi bệnh án đóng tại F3.10. |
| HEAD TRAINER | Không | | |
| GROOM | Không | | |
| HORSE OWNER | Không | | Xem tổng chi phí sau khi bệnh án đóng tại F3.10. |

### Nghiệp vụ

1. Chỉ đóng được bệnh án đang ở trạng thái Đang điều trị.
2. Khi đóng, bác sĩ nhập:
   - Kết luận cuối.
   - Tổng chi phí điều trị theo mục III.6: một số tiền duy nhất cho cả bệnh án. Hệ thống không tính tự động và không tách theo từng buổi khám hay từng loại thuốc.
3. Ngày đóng là thời điểm thực hiện thao tác.
4. Nếu lệnh khóa huấn luyện gắn với bệnh án này còn hiệu lực, hệ thống bắt chọn gỡ khóa hoặc giữ kèm ngày dự kiến gỡ (theo F3.8 nghiệp vụ 7).
4b. **Ngựa mất trong lúc điều trị:**
   - Bác sĩ nhập thêm ngày mất (không ở tương lai, không trước ngày sinh).
   - Trước khi lưu, hệ thống hiện bảng xác nhận hệ quả giống F1.8 (số lớp bị rút, ô bị trả, GROOM bị bỏ, khóa tự gỡ, yêu cầu khám và lịch bị hủy). Bệnh án đang mở không làm bảng này bị chặn, vì bệnh án được đóng trước khi ghi nhận mất.
   - Hệ thống đóng bệnh án rồi ghi nhận ngựa mất theo F1.8 mục 2b trong cùng một thao tác, lấy kết luận cuối làm nguyên nhân mất.
   - Lệnh khóa huấn luyện tự gỡ với lý do "Gỡ do ngựa mất". Bác sĩ không chọn gỡ hay giữ khóa; gửi kèm lựa chọn khóa thì báo lỗi.
   - Một bước lỗi thì hủy toàn bộ, bệnh án vẫn Đang điều trị.
   - Gửi cả thông báo đóng bệnh án (nghiệp vụ 10) và thông báo ngựa mất (F1.8).
5. Nếu trạng thái sức khỏe vẫn là Chấn thương hoặc Cách ly, hệ thống cảnh báo và hỏi bác sĩ có muốn cập nhật trạng thái trước khi đóng không. Bác sĩ vẫn được phép đóng, vì có trường hợp ngựa hồi phục dần mà bệnh án đã kết thúc.
6. Nếu con ngựa còn yêu cầu khám đang chờ, hệ thống báo số lượng để bác sĩ biết, kèm nút mở hàng đợi yêu cầu khám; các yêu cầu này vẫn ở hàng đợi và được xử lý như bình thường sau khi đóng. *(BA chốt)*
7. Sau khi đóng, bệnh án chuyển sang chỉ đọc. Không mở lại bệnh án đã đóng; vấn đề tái phát thì khám ngoài bệnh án (F3.3) và mở bệnh án mới.
8. Điều chỉnh chi phí sau khi đóng theo mục III.6.3: chỉ đổi con số tổng chi phí, bắt buộc lý do, ghi nhật ký giá trị trước và sau, gửi thông báo mức NORMAL cho HORSE OWNER của giai đoạn chứa bệnh án (III.6.8) và CLUB MANAGER.
9. Chi phí của bệnh án đã đóng được cộng vào tổng chi phí y tế của con ngựa, hiển thị ở F1.3 và F3.10.
10. Gửi thông báo mức NORMAL cho HORSE OWNER và CLUB MANAGER khi đóng.
11. Ghi nhật ký kèm tổng chi phí và kết luận cuối.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-09 |
| **Tên use case** | Đóng bệnh án, chốt và điều chỉnh chi phí |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | HORSE OWNER, CLUB MANAGER (nhận thông báo), Hệ thống (ghi nhật ký) |
| **Tiền điều kiện** | Đóng: bệnh án đang ở trạng thái Đang điều trị. Điều chỉnh chi phí: bệnh án đã đóng. |
| **Hậu điều kiện** | Bệnh án chuyển sang Đã đóng và chỉ đọc. Tổng chi phí được lưu và hiển thị cho chủ ngựa. |
| **Luồng sự kiện chính** | 1. VETERINARIAN mở bệnh án và chọn "Đóng bệnh án".<br>2. Hệ thống hiển thị biểu mẫu kết luận cuối và tổng chi phí, kèm lệnh khóa liên quan, trạng thái sức khỏe hiện tại và yêu cầu khám đang chờ.<br>3. VETERINARIAN nhập thông tin.<br>4. VETERINARIAN xác nhận lại số tiền.<br>5. Hệ thống đóng bệnh án, xử lý lệnh khóa theo lựa chọn, gửi thông báo và ghi nhật ký. |
| **Luồng thay thế** | A1. Khóa huấn luyện còn hiệu lực -> bác sĩ chọn gỡ khóa hoặc giữ kèm ngày dự kiến gỡ.<br>A2. Trạng thái sức khỏe vẫn là Chấn thương hoặc Cách ly -> hệ thống cảnh báo, bác sĩ có thể cập nhật trạng thái rồi đóng.<br>A3. Điều trị không mất chi phí -> nhập 0.<br>A4. Bác sĩ phát hiện chi phí nhập sai sau khi đóng -> chọn "Điều chỉnh chi phí", nhập số mới và lý do; hệ thống lưu, ghi nhật ký và thông báo lại.<br>A5. Ngựa mất trong lúc điều trị -> bác sĩ nhập ngày mất; hệ thống đóng bệnh án và ghi nhận ngựa mất cùng lúc (F1.8). |
| **Luồng ngoại lệ** | E1. Không nhập kết luận cuối hoặc chi phí -> báo lỗi.<br>E2. Chi phí âm hoặc không phải số nguyên -> báo lỗi.<br>E3. Đóng bệnh án đã đóng -> trả về 409.<br>E4. Điều chỉnh chi phí của bệnh án đang điều trị -> trả về 409.<br>E5. Khóa còn hiệu lực mà không chọn cách xử lý, hoặc chọn giữ khóa mà ngày dự kiến gỡ ở quá khứ -> báo lỗi.<br>E6. Có ngày mất mà vẫn chọn gỡ hoặc giữ khóa, hoặc ngày mất ở tương lai hay trước ngày sinh -> báo lỗi tại ô tương ứng, không đóng bệnh án. |

---

## F3.10 — Xem bệnh án và báo cáo y tế (Xem)

### Mô tả

Màn hình tra cứu lịch sử y tế của một con ngựa: các bệnh án, các buổi khám bên trong, buổi khám ngoài bệnh án, diễn biến chấn thương, trạng thái sức khỏe qua thời gian, lệnh khóa và chi phí. Đây cũng là nơi chủ ngựa theo dõi quá trình điều trị của ngựa mình.

### Phân quyền — quyền thao tác

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Xem | Toàn câu lạc bộ | |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | Có thêm báo cáo tổng hợp chi phí theo khoảng thời gian. |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | |
| GROOM | Không | | |
| HORSE OWNER | Xem | Ngựa sở hữu | |

### Phân quyền — thông tin hiển thị

Viết tắt: CM = Club Manager, HT = Head Trainer, VET = Veterinarian, GROOM = Groom / Stable Hand, OWNER = Horse Owner.

| Mục thông tin | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| 1. Danh sách bệnh án: ngày mở, chẩn đoán ban đầu, trạng thái, ngày đóng, kết luận cuối | Xem | Xem | Xem | Không | Xem |
| 2. Buổi khám (trong và ngoài bệnh án): ngày giờ, bác sĩ, chẩn đoán và hướng điều trị, kết luận, trạng thái sau khám, ghi chú chăm sóc, nhãn Đã hủy và lý do | Xem | Xem | Xem | Không | Xem |
| 3. Đơn thuốc: tên thuốc, ngày bắt đầu, ngày kết thúc | Xem | Xem | Xem | Không | Xem |
| 4. Đơn thuốc: liều lượng, tần suất | Xem | Xem | Xem | Không | Không |
| 5. Chấn thương và diễn biến hồi phục theo bệnh án | Xem | Xem | Xem | Không | Xem |
| 6. Lịch sử trạng thái sức khỏe | Xem | Xem | Xem | Không | Xem |
| 7. Lệnh khóa huấn luyện đang hiệu lực và lịch sử khóa | Xem | Xem | Xem | Không (chỉ nhãn trong F1.3) | Xem |
| 8. Chi phí của bệnh án đã đóng và tổng chi phí | Xem | Không | Xem | Không | Xem |

### Nghiệp vụ

1. Chủ ngựa xem được cả bệnh án đang điều trị, vì họ cần biết ngựa mình đang được chữa gì. Riêng chi phí chỉ hiện sau khi bệnh án đóng, và chỉ với bệnh án thuộc giai đoạn mình sở hữu (III.6.8).
2. HEAD TRAINER xem được toàn bộ nội dung y tế trừ chi phí (mục III.6.6).
3. Chỉ số cơ thể không hiển thị lại ở đây mà dùng chung màn hình của F1.5, tránh có hai nơi hiển thị cùng một dữ liệu.
4. CLUB MANAGER có thêm báo cáo tổng hợp: tổng chi phí y tế của các bệnh án đóng trong khoảng thời gian (theo ngày đóng), lọc theo khu chuồng (khu hiện tại của ngựa) hoặc theo chủ ngựa (theo giai đoạn sở hữu lúc bệnh án được đóng, III.6.8).
5. Dữ liệu ngoài quyền bị loại bỏ trước khi gửi về máy người dùng, không gửi đủ rồi ẩn ở giao diện.
6. Con ngựa ngoài phạm vi xem trả về 404. Ngựa đã chuyển nhượng hoặc đã mất vẫn tra cứu được bởi các vai trò trong câu lạc bộ và bởi chủ còn ghi trên hồ sơ. Chủ cũ đã bán ngựa bằng chuyển nhượng nội bộ thì mất quyền xem ngay khi việc chuyển chủ được lưu.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-10 |
| **Tên use case** | Xem bệnh án và báo cáo y tế |
| **Actor chính** | HORSE OWNER, VETERINARIAN, CLUB MANAGER, HEAD TRAINER |
| **Actor phụ** | Không |
| **Tiền điều kiện** | Người dùng đã đăng nhập. Con ngựa nằm trong phạm vi xem của người dùng. |
| **Hậu điều kiện** | Lịch sử y tế của con ngựa được hiển thị theo đúng phạm vi quyền. |
| **Luồng sự kiện chính** | 1. Người dùng mở hồ sơ ngựa và chọn tab Bệnh án.<br>2. Hệ thống kiểm tra phạm vi xem.<br>3. Hệ thống lấy danh sách bệnh án, buổi khám, lệnh khóa và lịch sử trạng thái sức khỏe.<br>4. Hệ thống loại bỏ các trường ngoài quyền, trong đó có chi phí với HEAD TRAINER và liều thuốc với HORSE OWNER.<br>5. Hệ thống hiển thị danh sách, mới nhất lên trên. |
| **Luồng thay thế** | A1. Người dùng mở một bệnh án -> hệ thống hiển thị toàn bộ buổi khám và diễn biến chấn thương của bệnh án đó.<br>A2. CLUB MANAGER chọn báo cáo tổng hợp -> hệ thống tính tổng chi phí theo khoảng thời gian và bộ lọc.<br>A3. Bệnh án đang điều trị -> hệ thống hiển thị nhãn Đang điều trị và không có ô chi phí. |
| **Luồng ngoại lệ** | E1. HORSE OWNER mở ngựa không thuộc sở hữu -> trả về 404.<br>E2. GROOM gọi trực tiếp API bệnh án -> trả về 403.<br>E3. Con ngựa chưa có dữ liệu y tế -> hiển thị danh sách trống kèm dòng giải thích. |

---

## F3.11 — Quản lý lịch chăm sóc định kỳ (Thêm, Sửa, Xem)

### Mô tả

Theo dõi các việc chăm sóc y tế lặp lại theo đề bài: tiêm phòng, tẩy giun và kiểm tra móng (Farrier). Mỗi lịch là một việc cần làm cho một con ngựa vào một ngày, hệ thống nhắc khi đến hạn.

### Phân quyền

| Vai trò | Quyền | Phạm vi | Ghi chú |
|---|---|---|---|
| VETERINARIAN | Thêm, Sửa, Xem | Toàn câu lạc bộ | Tạo, dời, hủy, đánh dấu hoàn tất. |
| CLUB MANAGER | Xem | Toàn câu lạc bộ | |
| HEAD TRAINER | Xem | Toàn câu lạc bộ | Xem để tránh xếp buổi tập trùng lịch. |
| GROOM | Xem, Sửa (hoàn tất) | Lịch được giao cho mình, khi vẫn đang phụ trách con ngựa | Đánh dấu hoàn tất việc được giao, ví dụ kiểm tra móng. |
| HORSE OWNER | Xem | Ngựa sở hữu | |

### Nghiệp vụ

1. Một lịch chăm sóc gồm: con ngựa, loại (Tiêm phòng, Tẩy giun, Kiểm tra móng), ngày đến hạn, người được giao (tùy chọn), ghi chú. Người được giao phải là VETERINARIAN đang hoạt động, hoặc GROOM đang hoạt động và đang phụ trách con ngựa. Khi HEAD TRAINER đổi GROOM phụ trách, GROOM cũ không còn nhận nhắc và không hoàn tất được lịch đó; VETERINARIAN giao lại cho người mới.
2. Trạng thái: Đã lên lịch, Hoàn tất, Đã hủy. Hoàn tất và Đã hủy là trạng thái cuối.
3. Dời ngày đến hạn hoặc hủy lịch bắt buộc nhập lý do.
4. Đánh dấu hoàn tất ghi lại thời điểm và người thực hiện. Khi hoàn tất, VETERINARIAN có thể nhập "Ngày đến hạn lần tới" (ví dụ tẩy giun sau 3 tháng): hệ thống tạo luôn lịch mới cùng loại trong cùng thao tác, giữ người được giao nếu vẫn hợp lệ. Để trống thì không tạo lịch mới. GROOM hoàn tất thì không nhập được ngày lần tới.
5. Đến ngày đến hạn, hệ thống gửi thông báo mức NORMAL theo mục III.7, mỗi lịch một lần cho mỗi ngày đến hạn: lịch bị dời sang ngày khác thì được nhắc lại theo ngày mới. *(BA chốt)* Lịch quá hạn chưa làm hiển thị trong bảng điều khiển y tế cùng khối lịch khám.
6. Khi ngựa chuyển nhượng, các lịch đang Đã lên lịch tự hủy với lý do "Do chuyển nhượng".
7. Không tạo lịch cho ngựa đã chuyển nhượng, đã mất hoặc hồ sơ đã xóa.
8. Ghi nhật ký khi tạo, dời, hủy và hoàn tất.

### Bảng use case

| | |
|---|---|
| **Mã use case** | UC-F3-11 |
| **Tên use case** | Quản lý lịch chăm sóc định kỳ |
| **Actor chính** | VETERINARIAN |
| **Actor phụ** | GROOM (hoàn tất việc được giao), Hệ thống (nhắc hạn, ghi nhật ký) |
| **Tiền điều kiện** | Người dùng đã đăng nhập. Con ngựa ở trạng thái Đang hoạt động hoặc Đã giải nghệ. |
| **Hậu điều kiện** | Lịch chăm sóc được tạo, dời, hủy hoặc hoàn tất và ghi nhật ký. |
| **Luồng sự kiện chính** | 1. VETERINARIAN mở tab Lịch chăm sóc của con ngựa.<br>2. VETERINARIAN chọn loại, ngày đến hạn, người được giao và lưu.<br>3. Đến hạn, hệ thống gửi thông báo.<br>4. Người thực hiện đánh dấu hoàn tất.<br>5. Hệ thống lưu thời điểm, người thực hiện và ghi nhật ký. |
| **Luồng thay thế** | A1. Dời ngày -> nhập lý do, hệ thống lưu ngày mới.<br>A2. Hủy lịch -> nhập lý do, hệ thống chuyển Đã hủy. |
| **Luồng ngoại lệ** | E1. Ngày đến hạn ở quá khứ khi tạo hoặc dời -> báo lỗi.<br>E2. Dời, hủy hoặc hoàn tất lịch đã Hoàn tất hoặc Đã hủy -> trả về 409.<br>E3. GROOM hoàn tất lịch không giao cho mình, hoặc không còn phụ trách con ngựa, hoặc nhập ngày lần tới -> trả về 403.<br>E4. Ngựa đã chuyển nhượng hoặc đã mất -> không cho tạo lịch (409). Hồ sơ đã xóa -> 404 (CLUB MANAGER: 409).<br>E5. Giao lịch cho người không phải VETERINARIAN hoặc GROOM đang phụ trách con ngựa -> báo lỗi. |

---

## Phụ lục 1: Thay đổi so với bản nháp đầu

Phần này để chiếu nhanh, không phải nội dung đặc tả. Các điểm dưới đây sửa sau khi phản biện chéo bản nháp.

| Bản nháp | Bản này | Lý do |
|---|---|---|
| Khám theo yêu cầu "luôn gắn với một bệnh án", ghi tại F3.6 | Gộp vào F3.3 "Buổi khám ngoài bệnh án", loại Định kỳ hoặc Theo yêu cầu | Ngựa chưa có bệnh án thì không có màn nào để ghi buổi khám theo yêu cầu; khám xong thấy bình thường chỉ còn cách "bỏ qua", sai sự thật. |
| Kết luận Có vấn đề rồi bấm "Mở bệnh án" riêng; lưu thất bại thì buổi khám vẫn giữ | Bắt buộc chẩn đoán ban đầu, lưu buổi khám và mở bệnh án cùng một thao tác | Tránh buổi khám Có vấn đề mồ côi; gắn buổi khám đã lưu vào bệnh án sau đó là sửa buổi khám, trái quy tắc không sửa. |
| Ghi sai thì "thêm buổi khám mới hoặc ghi chú đính chính" | Hủy buổi khám kèm lý do; số đo của buổi đó bị gỡ khỏi F1.5 | Số đo sai nằm vĩnh viễn trên biểu đồ và làm sai cảnh báo sụt cân; "ghi chú đính chính" chưa được định nghĩa. |
| CLUB MANAGER đặt chu kỳ khám trong danh mục hệ thống | Chu kỳ cố định 30 ngày | Không có trong đề bài; "danh mục hệ thống" không được định nghĩa ở đâu. |
| Hạn khám tính từ buổi khám gần nhất hoặc ngày tạo hồ sơ | Tính thêm ngày kích hoạt lại; tính theo ngày lịch Việt Nam | Ngựa vừa được mua lại bị báo quá hạn ngay. |
| Ngày hẹn phải sớm hơn hoặc bằng hạn | Ngày hẹn từ hôm nay; chỉ giới hạn theo hạn khi chưa quá hạn | Ngựa đã quá hạn không đặt được ngày hẹn nào. |
| Không nói gì về ngựa chuyển nhượng khi còn bệnh án | Chặn chuyển nhượng; yêu cầu khám, lịch hẹn, lịch chăm sóc tự hủy | Bệnh án kẹt Đang điều trị vĩnh viễn, chủ không thấy chi phí. |
| Chi phí nhập một lần, không sửa | Được điều chỉnh sau khi đóng, bắt buộc lý do, có nhật ký, thông báo lại | Gõ nhầm số tiền thì chủ ngựa thấy số sai vĩnh viễn. |
| Ba mức cảnh báo URGENT/HIGH/NORMAL "định nghĩa ở F1.5" | Ghi thẳng: sốt sinh yêu cầu Khẩn, sụt cân sinh yêu cầu Bình thường; không sinh từ số đo trong buổi khám | F1.5 chỉ có hai cảnh báo; tránh tự sinh yêu cầu cho chính con ngựa đang được khám và tránh thông báo trùng. |
| Vai trò không được phép vào dashboard trả 404 | Trả 403 | Đúng quy ước 404/403 của Flow 1. |
| Gỡ khóa chỉ báo HEAD TRAINER (mục III.7) nhưng F3.8 báo cả CLUB MANAGER | Thống nhất: HEAD TRAINER và CLUB MANAGER | Hai chỗ trong bản nháp nói khác nhau. |
| Không có đơn thuốc, chấn thương 3D, lịch tiêm phòng | Thêm vào buổi khám và thêm F3.11 | Đề bài của giảng viên có ba yêu cầu này. |
| Không có ghi chú chăm sóc dù Flow 4 cần | Thêm trường "Ghi chú chăm sóc" cho buổi khám | Mục phụ thuộc Flow 4 đã hứa cung cấp. |
| Không hủy được buổi mở bệnh án và buổi của bệnh án đã đóng | Buổi tái khám hủy được cả khi bệnh án đã đóng; mở nhầm thì hủy buổi mở, bệnh án chuyển Đã hủy | Phản biện vòng 2: mở nhầm ngựa hoặc số đo sai sau khi đóng thì không còn cách sửa. |
| Kích hoạt lại thì hạn khám cộng 30 ngày | Hạn khám bằng ngày kích hoạt lại cho tới khi khám | Ngựa đang Cần theo dõi mà 30 ngày không có gì nhắc bác sĩ. |
| Ngựa mất khi còn bệnh án thì phải chờ bác sĩ đóng bệnh án rồi CLUB MANAGER mới ghi nhận mất | Bác sĩ đóng bệnh án kèm ngày mất, hệ thống ghi nhận mất cùng lúc | Ngựa thường mất trong lúc điều trị; chờ hai bước thì ngựa vẫn hiện Đang hoạt động. Chi phí điều trị vẫn được chốt thật. |
| Lịch chăm sóc không tự lặp | Khi hoàn tất, bác sĩ nhập ngày lần tới để tạo luôn lịch mới | Quên tạo lịch lần sau là ngựa không bao giờ được nhắc. |
| Giao lịch cho GROOM bất kỳ | Chỉ GROOM đang phụ trách con ngựa | Đổi GROOM thì GROOM cũ vẫn thao tác được, lọt quyền. |
| Sơ đồ đàn chỉ đếm và liệt kê tên | Kèm khu và ô chuồng để vẽ trên chuồng trại | Đề bài yêu cầu "sơ đồ trạng thái sức khỏe trên giao diện chuồng trại". |
| Chấn thương không định danh qua các buổi khám | Định danh bằng (vùng cơ thể, loại) trong một bệnh án | Theo dõi được diễn biến hồi phục từng chấn thương. |
| Chấn thương/Cách ly chỉ báo HEAD TRAINER và CLUB MANAGER | Báo thêm HORSE OWNER | Đề bài: chủ theo dõi tình trạng sẵn sàng thi đấu. |
| Gợi ý chuyển ô khi Cách ly | Bỏ | Đề bài không yêu cầu; HEAD TRAINER chuyển ô bằng F1.7. |

## Phụ lục 2: Câu hỏi mở

Bản đầy đủ (bối cảnh, ví dụ, phương án A/B) nằm cuối trang tổng hợp nghiệp vụ gửi BA: https://claude.ai/artifact/TsCADNF5Kn51aF88q1Aouh. Bảng dưới ghi hướng hệ thống đang chạy; BA đã trả lời (các câu Q4–Q10 và câu số đo trong buổi khám).

| # | Câu hỏi | Liên quan | Hệ thống đang chạy |
|---|---|---|---|
| Q1 | Ngựa Cần theo dõi có được tập không (Flow 1 cho tập nhẹ, Flow 2 chặn hết)? | Flow 1, Flow 2 | Đã chốt: được tập buổi Nhẹ và Trung bình, không được đua. Buổi tập có cường độ; gặp buổi Nặng thì lượt tự đánh Không đủ điều kiện, chặn ở publish buổi, ghi danh, điểm danh, bắt đầu |
| Q2 | Khóa huấn luyện, Chấn thương, Cách ly có chặn lúc xếp lịch tập không? | Flow 2 | Đã chốt: chấm lại ngay các lượt sắp tới của ngựa khi đặt khóa, gỡ khóa hoặc đổi sức khỏe (lượt thành Hủy do khóa / Không đủ điều kiện, gỡ hoặc khỏe lại trước giờ tập thì về Chờ điểm danh); vẫn chặn lúc tạo lượt (publish buổi, ghi danh) và lúc bắt đầu buổi / điểm danh (Flow 2 luật 6) |
| Q3 | Báo cáo sự cố của GROOM chuyển sang yêu cầu khám thế nào? | Flow 4 | Đã chốt: sự cố khẩn tự tạo yêu cầu khám; sự cố thường do HEAD TRAINER chuyển bác sĩ (`docs/flow4-stable-care.md` mục 6) |
| Q4 | GROOM xem ghi chú chăm sóc của VET ở đâu? | Flow 4 | Đã chốt: trong hồ sơ ngựa; GROOM chỉ thấy ghi chú mới nhất của ngựa mình được giao |
| Q5 | Khi bị chặn 409, giao diện lấy chi tiết ở đâu? | FE | Đã chốt: lỗi chỉ có câu thông báo; giao diện gọi lại màn xem |
| Q6 | Có cần màn "Việc được giao cho tôi" cho GROOM không? | FE | Đã chốt: không cần, xem lịch chăm sóc theo từng con ngựa |
| Q7 | Tài liệu mô hình dữ liệu ghi quyền ghi số đo lệch spec F1.5 | Flow 1 | Đã xác nhận: theo spec F1.5 (cả bốn loại) |
| Q8 | Ngựa đã chuyển nhượng có được hủy buổi khám, điều chỉnh chi phí không? | Flow 1, F3.6, F3.9 | Đã chốt: chặn (hồ sơ đã chuyển nhượng chỉ xem được) |
| Q9 | Lọc bảng điều khiển theo trạng thái thì số đếm tính trên đâu? | F3.1 | Đã chốt: số đếm bốn mức theo bộ lọc khu, không theo bộ lọc sức khỏe |
| Q10 | BA xác nhận các thay đổi ở Phụ lục 1 | Toàn Flow 3 | Đã xác nhận |

Cần báo FE (theo câu trả lời BA):

- API mới `GET /horses/:horseId/care-instructions`: ghi chú chăm sóc đang hiệu lực để hiện trong hồ sơ ngựa (`current` = null khi không có). GROOM xem được ngựa mình phụ trách, 403 nếu không.
- Số đo bác sĩ ghi trong buổi khám không còn gửi cảnh báo sốt / sụt cân.
- Thông báo mới cho HEAD TRAINER khi sức khỏe chuyển sang Cần theo dõi (mức NORMAL).
- Hồ sơ đã xóa, CLUB MANAGER thao tác ghi: 409 thay cho 403 (theo Flow 1).

Đã chốt: GROOM không gửi yêu cầu khám trực tiếp; yêu cầu nguồn "Báo cáo sự cố của GROOM" sinh từ sự cố của Flow 4 (`docs/flow4-stable-care.md` mục 6).
