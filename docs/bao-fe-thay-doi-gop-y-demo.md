# Thay đổi API cần FE cập nhật

Cập nhật: 2026-10-20

Mọi path có tiền tố `/api/v1`. Vai trò viết tắt: CM = Club Manager, HT = Head Trainer, VET = bác sĩ thú y, GROOM = người chăm ngựa, OWNER = chủ ngựa. Lỗi vẫn theo format chung. Schema chi tiết: `docs/api-catalog.md`, `docs/openapi.contracts.json`.

Xếp theo ngày, ngày mới nhất ở trên. Cùng một field đổi nhiều ngày thì mục của ngày mới nhất là hành vi hiện tại; phần cũ đã bị thay có ghi "(đã thay ở ...)". API chặn field lạ: gửi field không có trong request là 400 "Không nhận ô `<tên ô>`", không ghi gì.

## Ngày 20/10/2026

### Báo cáo sức khỏe ngựa bỏ bệnh án đã hủy

- `GET /reports/horses/:horseId/health`: `medicalCases` không còn bệnh án `CANCELLED` (mở nhầm) ở bất kỳ kỳ nào. Response shape giữ nguyên.

### F4-2: Sửa số tiền mức phí ngày

**Luật / hành vi API mới**
1. API mới `PATCH /daily-fees/:id` (CM), body `{ dailyFee, reason }`, cả hai bắt buộc. `dailyFee` kiểm như khi tạo; `reason` cắt khoảng trắng, không rỗng, tối đa 500 ký tự. Trả về mức phí sau khi sửa (cùng shape với `GET /daily-fees`).
2. Sửa được mức chưa hiệu lực (`effectiveFrom` sau hôm nay) và mức đang áp dụng (`effectiveFrom` lớn nhất từ hôm nay trở về trước). Mức cũ đã được thay: 409 "Mức phí đã được thay bằng mức mới, không sửa được". Không có: 404.
3. Không sửa ngày hiệu lực: gửi `effectiveFrom` là 400. Gửi đúng số tiền đang có thì không ghi gì, trả về mức hiện có.
4. Báo cáo phí (`/reports/owner/costs`, `/reports/club/finance`) tính lại theo số tiền mới cho mọi ngày mức đó áp dụng. Không gửi thông báo cho chủ.

**FE cần sửa**
- Danh sách mức phí: nút "Sửa" ở mức chưa hiệu lực và mức đang áp dụng (mức đầu tiên có `effectiveFrom` ≤ hôm nay theo lịch CLB khi xếp mới nhất trước); ẩn ở các mức cũ hơn.
- Form sửa: chỉ ô số tiền và ô lý do (bắt buộc); ngày hiệu lực chỉ hiển thị.

**Lý do**
- Mức phí nhập sai số tiền mà đã tới ngày hiệu lực thì trước đây không xóa, không sửa được, báo cáo phí tính sai.

### F1-4: Kích hoạt lại ngựa đã chuyển nhượng, sức khỏe về Cách ly

**Luật / hành vi API mới**
1. `PATCH /horses/:horseId/lifecycle-status` đổi `TRANSFERRED` → `ACTIVE`: `healthStatus` của ngựa thành `QUARANTINED` (trước là `UNDER_OBSERVATION`). Ngựa không được tập cho tới khi bác sĩ đổi sức khỏe.
2. Preview (`GET /horses/:horseId/lifecycle-status/preview`) có `healthResetTo: "QUARANTINED"`; `summary` ghi "đặt sức khỏe về Cách ly tới khi bác sĩ khám lại".
3. Ngựa này hiện ở khối `horsesWithoutCase` của `GET /medical/dashboard`. Kích hoạt lại từ `RETIRED` không đổi sức khỏe. Không có thông báo đổi sức khỏe riêng.

**FE cần sửa**
- Màn xác nhận kích hoạt lại hiện "Sức khỏe về Cách ly" theo `healthResetTo`. Không hard-code `UNDER_OBSERVATION`.

**Lý do**
- Ngựa mua lại từ ngoài chưa rõ tình trạng. Trước đây ngựa về Cần theo dõi nên vẫn tập buổi Nhẹ được trước khi bác sĩ khám.

### F2-3: Ngựa đã điểm danh thì chưa đổi khu, giải nghệ, chuyển nhượng; HT xem mọi lượt, HT của lớp giữ quyền ghi lượt đã tập xong

**Luật / hành vi API mới**
1. Ngựa có lượt `PRESENT`, `READY` hoặc `ONGOING` (đã điểm danh, chưa kết thúc lượt) là "đang ở buổi tập". Trước chỉ `ONGOING` mới chặn.
   - Đổi khu (`PUT /horses/:horseId/barn`, lượt thuộc lớp sẽ bị rút): 409 "Ngựa đang ở buổi tập (đã điểm danh), chờ kết thúc lượt tập rồi mới đổi khu". `GET /horses/:horseId/barn-preview` trả `allowed: false`, `blockedReason` đúng câu này.
   - Giải nghệ, chuyển nhượng (`PATCH /horses/:horseId/lifecycle-status`): 409 "Ngựa đang ở buổi tập (đã điểm danh), chờ kết thúc lượt tập rồi mới giải nghệ hoặc chuyển nhượng". Preview lifecycle trả `allowed: false` với câu này.
   - Lượt `PLANNED` và lượt đã kết thúc không chặn.
   - Ghi nhận ngựa mất không bị chặn. Mọi lượt `PLANNED`, `PRESENT`, `READY`, `ONGOING` của ngựa ở mọi buổi (kể cả buổi đã bắt đầu) chuyển `CANCELLED`, `cancelReason` "Ngựa đã mất". Trước: chỉ hủy `ONGOING`; lượt của buổi đã bắt đầu thì `PLANNED` cuối buổi thành `ABSENT` ("Hết giờ, chưa điểm danh"), `PRESENT`/`READY` thành `SKIPPED`; lượt buổi chưa tới giờ có `cancelReason` "Ngựa mất: <lý do>". Nhật ký vòng đời ghi `unfinishedRunsCancelled` (thay `ongoingRunsCancelled`).
2. Xem từng lượt: mọi HT xem được mọi lượt, không xét lớp hay khu (trước: HT của lớp và ngựa đang ở khu mình). Groom chỉ lượt mình dắt, chủ ngựa chỉ ngựa mình.
   - Áp dụng: `GET /session-participants/:id/trial-results`, `GET /session-participants/:id/metrics`, `GET /session-participants/:id/performance-summary`, `GET /session-participants/:id/evaluation`.
   - `GET /session-participants/:id/evaluation` trước xét theo khu và cho Groom xem mọi ngựa; nay theo luật trên: Groom không dắt lượt đó nhận 404 "Không tìm thấy lượt tập".
   - `GET /training-sessions/:sessionId/participants` vẫn chỉ HT của lớp mở được buổi; HT của lớp thấy mọi lượt trong buổi, kể cả ngựa đã sang khu khác.
3. Ghi, sửa lượt đã tập xong (`COMPLETED`, `STOPPED`): chỉ HT phụ trách lớp, kể cả khi ngựa đã sang khu của HT khác. HT khác 403 "Lượt tập thuộc lớp của Huấn luyện viên trưởng khác".
   - Áp dụng: `POST`/`PATCH /session-participants/:id/evaluation`, `POST /session-participants/:id/trial-results`, `PATCH /session-participants/:id/trial-results/:attemptNo`.
   - Ngựa đã chuyển nhượng hoặc đã mất: vẫn xem, ghi/sửa trả 409 "Ngựa đã chuyển nhượng, hồ sơ chỉ được xem" / "Ngựa đã mất, hồ sơ chỉ được xem".
4. `PATCH /session-participants/:id/trial-results/:attemptNo` sai HT trả 403 câu "Lượt tập thuộc lớp của Huấn luyện viên trưởng khác" (trước là "Lớp thuộc Huấn luyện viên trưởng khác"). Lượt còn `ONGOING` thì ngựa phải thuộc khu người gọi như các thao tác khác trên lượt đang tập.

**FE cần sửa**
- Hiện `blockedReason` của preview đổi khu, preview vòng đời như cũ; không tự suy "đang tập" từ `ONGOING`.
- Từ tab Huấn luyện của ngựa, mọi HT mở được chi tiết lượt, kết quả chạy thử, nhịp tim, đánh giá; chỉ hiện nút ghi/sửa khi người xem là HT của lớp.
- Màn lượt tập của lớp: không ẩn nút đánh giá, sửa kết quả chạy thử chỉ vì ngựa đã sang khu khác. Ngựa đã chuyển nhượng, đã mất thì ẩn nút ghi/sửa hoặc hiện câu 409.

**Lý do**
- Ngựa đã điểm danh đang ở sân tập, đổi khu hay bán lúc đó làm lượt tập mồ côi. Lượt đã tập là việc của lớp nên HT của lớp phải hoàn tất được đánh giá, kết quả.
- Requirement cho HT xem tổng quan toàn bộ ngựa trong CLB; tab Huấn luyện của ngựa vốn đã cho mọi HT xem, nên API theo lượt mở cùng luật. Quyền ghi vẫn chỉ HT của lớp.

### F2-4: Điểm danh lại lượt đã báo vắng nhầm

**Luật / hành vi API mới**
1. `POST /session-participants/:id/check-in` nhận lượt `ABSENT` như lượt `PLANNED`, cùng khung giờ điểm danh (30 phút trước giờ bắt đầu tới giờ kết thúc buổi), cùng quyền (HT của lớp, ngựa thuộc khu mình; GROOM lượt được giao). Lượt thành `PRESENT`, `absenceReason` về `null`, nhật ký ghi `ABSENT` → `PRESENT`.
2. Buổi đã tự chuyển `COMPLETED` vì lượt vắng là lượt mở cuối cùng: điểm danh lại mở buổi về `IN_PROGRESS`.
3. Vẫn 409: buổi đã hủy, buổi đã hết giờ (kể cả lượt Vắng do hệ thống đánh lúc hết giờ), lượt ở trạng thái khác `PLANNED`/`ABSENT`. Câu 409 trạng thái lượt đổi thành "Chỉ lượt chờ điểm danh hoặc đã báo vắng mới được điểm danh".
4. Ngựa không còn được tập lúc điểm danh lại: như điểm danh thường, lượt thành `INELIGIBLE` hoặc `CANCELLED_BY_LOCK` và trả 409; buổi chỉ có lượt đó thì đóng thành `CANCELLED`, `cancelReason` "Không còn ngựa tham gia".

**FE cần sửa**
- Lượt `ABSENT` hiện nút "Điểm danh lại" khi buổi còn trong khung giờ điểm danh, kể cả khi buổi đang hiện `COMPLETED` mà chưa tới giờ kết thúc. Gọi đúng API check-in, sau đó tải lại lượt và trạng thái buổi.

**Lý do**
- Groom hoặc HT bấm nhầm báo vắng thì trước đây không sửa được, ngựa mất buổi tập dù đang có mặt.

### F2-6: Cảnh báo sốt, sụt cân chỉ gửi thông báo, không tự tạo yêu cầu khám

**Luật / hành vi API mới**
1. `POST /horses/:horseId/measurements` vẫn trả `alerts` (`FEVER`, `WEIGHT_DROP`) và vẫn gửi thông báo `MEASUREMENT_ALERT` cho VET, HT khu và OWNER như cũ.
2. Không còn tạo yêu cầu khám nguồn `MEASUREMENT_ALERT` (người gửi Hệ thống, `requestedBySystem: true`). Yêu cầu khám chỉ đến từ HT, CM, VET gửi tay (`POST /horses/:horseId/exam-requests`) hoặc từ báo cáo sự cố của GROOM (sự cố khẩn, HT chuyển bác sĩ).
3. Yêu cầu `MEASUREMENT_ALERT` đã có trong dữ liệu vẫn trả trong hàng đợi với `requestedBy: null`, `requestedBySystem: true`, `alertType`; khám, bỏ qua, đổi mức độ như thường. Enum `source` giữ nguyên.

**FE cần sửa**
- Sau khi ghi chỉ số sốt, không chờ hay tải lại hàng đợi để thấy yêu cầu "Hệ thống"; sẽ không có yêu cầu mới.
- Bỏ chữ hứa hẹn kiểu "đã tự tạo yêu cầu khám" ở màn ghi chỉ số, màn cảnh báo.
- Vẫn giữ cách hiện người gửi "Hệ thống" khi `requestedBySystem: true` cho dữ liệu cũ.

**Lý do**
- Đề bài không yêu cầu tự sinh yêu cầu khám; ca sốt đi qua báo cáo sự cố của Groom. Cần khám hay không do người có chuyên môn quyết.

### F3-1: VET điều chỉnh chi phí buổi khám của ngựa đã chuyển nhượng, đã mất

**Luật / hành vi API mới**
1. `PATCH /medical-records/:id/cost` (VET) nhận cả buổi khám của ngựa `TRANSFERRED` hoặc `DECEASED`, kể cả bệnh án đã đóng kèm ghi nhận ngựa mất. Trước trả 409.
2. Thông báo điều chỉnh vẫn gửi CM và chủ của giai đoạn chứa ngày khám (ngựa đã chuyển nhượng: chủ cũ nhận).
3. Còn 409: buổi khám đã hủy. Hồ sơ đã xóa vẫn 404 (CM: 409). Hủy buổi khám (`POST /medical-records/:id/void`) và mọi thao tác ghi y tế khác trên ngựa đã chuyển nhượng, đã mất vẫn 409.

**FE cần sửa**
- Hồ sơ ngựa đã chuyển nhượng, đã mất: vẫn hiện nút "Điều chỉnh chi phí" trên từng buổi khám chưa hủy cho VET. Các nút khác giữ ẩn như cũ.

**Lý do**
- Chi phí nhập sai của buổi khám cũ vẫn phải sửa được cho đúng với chủ của giai đoạn đó, kể cả sau khi ngựa rời câu lạc bộ hoặc mất.

### F3-15: Chỉ bác sĩ ghi buổi khám mới điều chỉnh được chi phí

**Luật / hành vi API mới**
1. `PATCH /medical-records/:id/cost`: chỉ VET ghi buổi khám (`vetId` của buổi) được điều chỉnh. VET khác nhận 403 "Chỉ bác sĩ ghi phiếu khám mới được điều chỉnh chi phí phiếu này", không ghi gì.
2. Thứ tự lỗi giống hủy buổi khám: 403 sai bác sĩ trả trước 409 buổi đã hủy.
3. Các luật khác giữ nguyên: bắt buộc lý do, ngựa đã chuyển nhượng hoặc đã mất vẫn điều chỉnh được, số trùng số cũ thì không ghi, thông báo CM và chủ của giai đoạn chứa ngày khám.

**FE cần sửa**
- Chỉ hiện nút "Điều chỉnh chi phí" khi `vetId` của buổi khám là người đang đăng nhập. Gặp 403 thì hiện câu lỗi trả về.

**Lý do**
- Chi phí là số bác sĩ ghi buổi khám nhập; bác sĩ khác sửa thì người ghi không biết. Đi cùng luật hủy buổi khám. Hệ quả đã chấp nhận: bác sĩ đã nghỉ việc thì chi phí các buổi của họ không còn ai sửa được.

### F3-11: Báo cáo chi phí y tế lọc khu theo khu của ngựa lúc khám

**Luật / hành vi API mới**
1. `GET /medical/cost-report?barnId=` (CM) tính các buổi khám mà lúc khám ngựa đang ở khu đó, không còn theo khu hiện tại của ngựa. Response giữ nguyên.
2. Ngựa chuyển khu sau buổi khám: chi phí buổi đó vẫn ở khu cũ; buổi khám sau khi chuyển tính cho khu mới.
3. Ngựa đã chuyển nhượng hoặc đã mất (không còn khu): chi phí các buổi trước đó vẫn hiện ở khu lúc khám.
4. Buổi khám lúc ngựa chưa thuộc khu nào không vào khu nào (vẫn có khi không lọc khu).

**FE cần sửa**
- Đổi nhãn bộ lọc khu của báo cáo chi phí y tế thành "Khu của ngựa lúc khám".

**Lý do**
- Lọc theo khu hiện tại làm chi phí cũ chạy theo ngựa sang khu mới, ngựa đã rời câu lạc bộ thì mất khỏi mọi khu, và báo cáo kỳ cũ đổi số mỗi khi ngựa chuyển khu.

### F3-4: Hủy buổi khám trả yêu cầu khám về hàng đợi và đưa sức khỏe về như trước

**Luật / hành vi API mới**
1. `POST /medical-records/:id/void`: yêu cầu khám mà buổi khám đã chuyển `EXAMINED` quay về `PENDING`, `medicalRecordId`, `handledBy`, `handledAt` về `null`. Trước giữ `EXAMINED`. Không có thông báo mới.
   - Ngoại lệ: yêu cầu cũ nguồn `MEASUREMENT_ALERT` mà ngựa đã có yêu cầu `PENDING` cùng `alertType` thì thành `DISMISSED`, `dismissReason` "Buổi khám bị hủy, ngựa đã có yêu cầu đang chờ cùng loại cảnh báo".
2. Ghi lại buổi thay thế: `POST /horses/:horseId/medical-records` với `kind: REQUEST`, `requestIds` gồm lại các yêu cầu đó, `replacesRecordId` là buổi đã hủy. Trước trả 400/409 vì yêu cầu không còn chờ.
3. Sức khỏe: buổi bị hủy đã đổi sức khỏe và chưa có lần đổi sức khỏe nào sau đó thì `healthStatus` của ngựa về giá trị trước buổi khám, có thông báo đổi sức khỏe như F3.7 và lượt tập sắp tới được chấm lại. Có lần đổi sau đó thì giữ nguyên.
4. Response thêm hai field:
   - `healthOutcome`: `REVERTED` (đã về giá trị trước khám), `KEPT_LATER_CHANGE` (giữ nguyên vì đã có lần đổi sau), `NOT_CHANGED_BY_VISIT` (buổi khám không đổi sức khỏe), `UNKNOWN_BEFORE` (buổi khám ghi trước bản này, giữ nguyên).
   - `laterHealthChange`: `{ changedAt, changedBy, to }` của lần đổi sau buổi khám; chỉ có khi `KEPT_LATER_CHANGE`, còn lại `null`.

**FE cần sửa**
- Sau khi hủy, tải lại hàng đợi yêu cầu khám và hồ sơ ngựa (sức khỏe có thể đã đổi).
- `KEPT_LATER_CHANGE`: hiện cho bác sĩ "Sức khỏe hiện tại do <người> đổi lúc <giờ>, không tự quay lại; đổi bằng Cập nhật sức khỏe nếu cần". `REVERTED`: hiện "Sức khỏe đã về <trạng thái>".
- Nút "Ghi buổi thay thế" của buổi theo yêu cầu: điền sẵn `requestIds` là các yêu cầu của buổi đã hủy.

**Lý do**
- Buổi theo yêu cầu ghi nhầm thì trước đây không ghi lại được, vì yêu cầu đã ở Đã khám. Sức khỏe sai do buổi ghi nhầm vẫn chặn tập và đua cho tới khi bác sĩ nhớ đổi lại.

### Sửa buổi khám: `PATCH /medical-records/:id`

**Luật / hành vi API mới**
1. API mới, chỉ VET ghi buổi khám (`vetId`), VET khác 403 "Chỉ bác sĩ ghi phiếu khám mới được sửa phiếu này". Buổi đã hủy 409, ngựa đã chuyển nhượng hoặc đã mất 409.
2. Body: `reason` bắt buộc và ít nhất một ô khác (400 "Không có nội dung nào để sửa"). Ô không gửi giữ nguyên.
   - `diagnosis`, `careInstructions`, `nextVisitAt`: gửi `null` là xóa.
   - `healthStatus`: trạng thái sau khám; lý do đổi sức khỏe là `reason`.
   - `measurements: [{ type, value }]`: sửa theo **loại** chỉ số đã đo trong buổi (loại chưa đo: 400); giá trị bất thường cần `confirmAbnormal: true` (422).
   - `prescriptions`: thay toàn bộ, `[]` là bỏ hết.
   - `injuries: [{ injuryId, recoveryStatus?, notes?, bodyRegion?, injuryType?, position? }]`: sửa vết có trong buổi; vùng, loại, vị trí chỉ với vết phát hiện ở buổi này. `removedInjuryIds`: xóa vết phát hiện ở buổi này, 409 nếu buổi khác đã ghi nhận.
   - `requestIds`: thay toàn bộ; yêu cầu bị bỏ về `PENDING`, yêu cầu thêm phải đang chờ của chính ngựa (409) và người gửi được báo.
   - Chỉ buổi ngoài bệnh án và buổi mở bệnh án: `kind`, `conclusion`, `initialDiagnosis`. Buổi tái khám gửi ba ô này: 400.
3. `conclusion` `NORMAL` → `ISSUE`: bắt buộc `initialDiagnosis`, mở bệnh án (ngày mở là `examDate`). 409 nếu ngựa đang có bệnh án mở hoặc đã có buổi khám chưa hủy sau buổi này. `ISSUE` → `NORMAL`: bệnh án chuyển `CANCELLED`, 409 nếu bệnh án đã đóng hoặc còn buổi khác; phải gửi kèm `removedInjuryIds`, `nextVisitAt: null` nếu buổi có các thứ đó.
4. Bệnh án đã đóng: sửa được, trừ `nextVisitAt` khác null (400), thêm yêu cầu khám (409), chấn thương sửa thành chưa lành (409).
5. Không sửa ngựa, bác sĩ, `examDate`, `cost` (vẫn dùng `PATCH /medical-records/:id/cost`).
6. Response là buổi khám như `GET /medical-records/:id` kèm:
   - `healthOutcome`: `UNCHANGED`, `UPDATED` (sức khỏe ngựa đổi theo), `KEPT_LATER_CHANGE` (chỉ đổi `resultingStatus` của buổi, sức khỏe ngựa giữ nguyên vì đã có lần đổi sau).
   - `laterHealthChange`: `{ changedAt, changedBy, to }`, chỉ có khi `KEPT_LATER_CHANGE`.
7. Hủy buổi khám sau khi đã sửa sức khỏe của nó vẫn đưa sức khỏe về giá trị trước buổi khám.

**FE cần sửa**
- Thêm nút "Sửa buổi khám" chỉ khi `vetId` là người đang đăng nhập và buổi chưa hủy. Form điền sẵn giá trị hiện tại, chỉ gửi ô đã đổi, bắt buộc ô lý do.
- Số đo trong form gửi theo `type`; không có ô thêm loại chỉ số mới.
- `KEPT_LATER_CHANGE`: hiện "Sức khỏe hiện tại do <người> đổi lúc <giờ>, không đổi theo; đổi bằng Cập nhật sức khỏe nếu cần". Sau khi sửa, tải lại hồ sơ ngựa, hàng đợi yêu cầu khám, bệnh án.

**Lý do**
- Trước đây buổi khám không sửa được, ghi sai một chữ cũng phải hủy rồi ghi lại, và buổi của bệnh án đã đóng thì không ghi lại được. Phần mềm thú y thực tế cho đính chính kèm quyền, lý do, nhật ký.

### F3-9: Hủy ngày hẹn khám định kỳ, nhắc ngày hẹn, Groom xem lịch hẹn hôm nay

**Luật / hành vi API mới**
1. `DELETE /horses/:horseId/checkup-appointment` (VET): body `{ "reason": "..." }` bắt buộc. Thành công 204, ngày hẹn chuyển `CANCELLED`. Ngựa không có ngày hẹn đang hiệu lực: 404. Ngựa đã chuyển nhượng hoặc đã mất: 409.
2. Ngày hẹn là việc chung của mọi bác sĩ, không giao bác sĩ nào. Response của ngày hẹn không đổi.
3. Mỗi sáng hệ thống gửi thông báo `CARE_REMINDER` cho mọi bác sĩ khi tới ngày hẹn. Ngày hẹn đã qua mà chưa khám được nhắc một lần.
4. `GET /grooms/me/today` có thêm mảng `horseVetAppointments`: ngày hẹn hôm nay của ngựa Groom phụ trách (`id`, `horseId`, `horseName`, `type`, `scheduledAt`), theo giờ hẹn. Ngày hẹn không nằm trong `careSchedules`, không hoàn tất được.

**FE cần sửa**
- Màn lịch khám định kỳ: thêm nút "Hủy lịch hẹn" (VET) mở ô nhập lý do, gọi DELETE ở mục 1.
- Màn Hôm nay của Groom: thêm khối "Lịch hẹn bác sĩ hôm nay" chỉ để xem (tên ngựa, giờ), không có nút hoàn tất.

**Lý do**
- Trước đây ngày hẹn đặt nhầm không hủy được, không ai được nhắc khi tới ngày hẹn, và Groom không biết hôm nay ngựa có lịch khám để chuẩn bị.

## Ngày 19/10/2026

### Chuẩn thời gian: thời điểm bắt buộc có múi giờ, ngày lịch đúng YYYY-MM-DD

**Luật / hành vi API mới**

API chỉ có hai dạng thời gian. Gửi sai dạng là 400, không lưu gì.

1. **Thời điểm** (có giờ): ISO 8601 bắt buộc kèm múi giờ.
   - Đúng: `2026-10-23T00:30:00+07:00`, hoặc `2026-10-22T17:30:00Z` (lấy từ `toISOString()`). Giây và phần lẻ giây tùy chọn.
   - Sai (400): `2026-10-23T00:30:00` (thiếu múi giờ), `2026-10-23` (thiếu giờ), `2026-10-23 00:30:00+07:00` (dấu cách thay `T`), `+0700` (thiếu dấu `:`).
2. **Ngày lịch** (không có giờ): đúng `YYYY-MM-DD`, vd `2026-10-23`. Gửi kèm giờ (vd `2026-10-20T17:00:00Z`) hoặc ngày không có thật (vd `2026-02-30`) là 400.
3. **Response**:
   - Thời điểm luôn là UTC dạng `...Z`, vd `2026-10-22T17:30:00.000Z`.
   - Ngày lịch luôn là `YYYY-MM-DD`.
4. **Câu báo lỗi 400** (`errors[].field` là tên ô; ô lồng thì `field` và tên ô trong câu đều là đường dẫn, vd "sessions.0.scheduledStartAt phải là thời điểm ISO 8601 có múi giờ, vd 2026-10-23T00:30:00+07:00"):
   - Ô thời điểm: "`<tên ô>` phải là thời điểm ISO 8601 có múi giờ, vd 2026-10-23T00:30:00+07:00", vd "measuredAt phải là thời điểm ISO 8601 có múi giờ, vd 2026-10-23T00:30:00+07:00".
   - Ô ngày có câu riêng giữ câu cũ: "Từ ngày phải có dạng YYYY-MM-DD", "Đến ngày phải có dạng YYYY-MM-DD", "Ngày bắt đầu phải có dạng YYYY-MM-DD", "Ngày kết thúc phải có dạng YYYY-MM-DD", "Ngày sinh phải có dạng YYYY-MM-DD", "Ngày hiệu lực phải có dạng YYYY-MM-DD". Trước đây ô sai dạng có thể nhận hai câu (thêm câu ISO 8601); nay chỉ một câu.
   - Ô ngày không có câu riêng: "`<tên ô>` phải là ngày dạng YYYY-MM-DD", vd "startDate phải là ngày dạng YYYY-MM-DD".
5. **Ô thời điểm** (trước đây nhận cả chuỗi thiếu múi giờ):

   | Endpoint | Ô |
   | --- | --- |
   | `POST /classes/:classId/sessions`, `PATCH /training-sessions/:sessionId` | `scheduledStartAt`, `scheduledEndAt` |
   | `POST /classes/:classId/sessions/bulk` | `sessions[].scheduledStartAt`, `sessions[].scheduledEndAt` |
   | `POST /classes/:classId/enrollments` | `enrolledAt` |
   | `PATCH /enrollments/:id/leave` | `leftAt` |
   | `POST /horses/:horseId/measurements` | `measuredAt` |
   | `GET /horses/:horseId/measurements` | query `from`, `to` |
   | `POST /horses/:horseId/care-schedules`, `PATCH /care-schedules/:id` | `dueAt` |
   | `POST /care-schedules/:id/complete` | `nextDueAt` |
   | `PUT /horses/:horseId/checkup-appointment` | `scheduledAt` |
   | `POST /horses/:horseId/medical-records`, `POST /medical-cases/:caseId/visits` | `nextVisitAt` |
   | `POST /medical-cases/:caseId/close` | `lockExpectedEnd` |
   | `POST /horses/:horseId/training-locks` | `lockEnd` |
   | `POST /session-participants/:id/metrics` | `recordedAt` |
   | `POST /session-participants/:id/metrics/batch` | `metrics[].recordedAt` |

6. **Ô ngày lịch**:
   - Trước đây nhận cả chuỗi có giờ rồi tự cắt lấy 10 ký tự đầu, nay 400:
     - `POST /classes`, `PATCH /classes/:classId`: `startDate`.
     - `GET /horses/:id/alerts`, `GET /horses/:id/workload`: query `from`, `to`.
   - Trước đây chỉ kiểm dạng, nay chặn thêm ngày không có thật (vd `2026-02-30`):
     - `GET /medical/cost-report`: query `from`, `to`.
     - `POST /horses/:horseId/medical-records`, `POST /medical-cases/:caseId/visits`: `prescriptions[].startDate`, `prescriptions[].endDate`.
   - Không đổi hành vi, chỉ có thể bớt một câu lỗi thừa: `POST /horses`, `PATCH /horses/:horseId` (`dateOfBirth`); `POST /horses/:horseId/care-tasks` (`fromDate`, `toDate`); `GET /horses/:horseId/checklists`, `GET /audit-logs`, `GET /reports/dashboard`, `GET /reports/club/finance`, `GET /reports/owner/costs`, `GET /reports/horses/:horseId/progress`, `GET /reports/horses/:horseId/health` (query `from`, `to`); `POST /horses/:horseId/surcharges` (`startDate`, `endDate`); `POST /daily-fees` (`effectiveFrom`).

**FE cần sửa**
- Gửi thời điểm kèm múi giờ (`toISOString()` là đủ), gửi ngày đúng `YYYY-MM-DD` cho mọi ô ở bảng trên.
- Thời điểm trong response: parse rồi để thư viện đổi sang giờ của máy. Không tự cộng 7 giờ.
- Ngày lịch trong response: hiển thị bằng cách tách chuỗi. Không parse thành `Date`/`DateTime`: `new Date('2026-10-23')` là 00:00 UTC, máy ở múi giờ âm sẽ hiện thành 22/10.

**Lý do**
- Chuỗi thiếu múi giờ bị server hiểu theo múi giờ của process, chạy ở UTC thì lệch 7 giờ. Ô ngày cắt 10 ký tự đầu làm `2026-10-20T17:00:00Z` (00:00 ngày 21 giờ CLB) thành ngày 20.

### B2: Ghi và sửa kết quả buổi tập không giới hạn thời gian

**Luật / hành vi API mới**
1. `POST /session-participants/:id/trial-results` (ghi kết quả chạy thử) theo trạng thái buổi:

   | Trạng thái buổi | Kết quả |
   | --- | --- |
   | `IN_PROGRESS` | Ghi được (như cũ) |
   | `COMPLETED` | Ghi được, không giới hạn thời gian (mới) |
   | `SCHEDULED` | 409 "Buổi tập chưa bắt đầu, chưa ghi kết quả được" |
   | `CANCELLED` | 409 "Buổi tập đã hủy, không ghi kết quả được" |

   - Trước đây hai trạng thái bị chặn trả chung câu "Buổi tập chưa ở trạng thái đang diễn ra".
   - Thứ tự kiểm: không phải buổi chạy thử (409 "Buổi tập không phải buổi chạy thử") → trạng thái buổi → trạng thái lượt (phải `ONGOING`, `COMPLETED` hoặc `STOPPED`).
2. `PATCH /session-participants/:id/trial-results/:attemptNo` và `PATCH /session-participants/:id/evaluation`: bỏ hạn 7 ngày, sửa được bất kỳ lúc nào sau buổi. Buổi đã hủy vẫn 409 "Buổi tập đã hủy, không sửa kết quả được". Câu 409 "Quá hạn sửa kết quả buổi tập" không còn.
3. Quyền, `reason` bắt buộc và nhật ký trước/sau giữ nguyên (xem mục 18/10 "Sửa kết quả chạy thử và đánh giá sau buổi").

**FE cần sửa**
- Hiện nút ghi kết quả chạy thử cả khi buổi `COMPLETED`. Bỏ chặn/ẩn nút sửa sau 7 ngày.
- Xử lý hai câu 409 mới khi buổi `SCHEDULED` hoặc `CANCELLED`.

**Lý do**
- Trước đây buổi tự đóng khi xong lượt cuối là không ghi thêm kết quả được, và quá 7 ngày thì không sửa được số ghi nhầm.

### B3: Chuyển nhượng hoặc ghi nhận mất thì chốt dữ liệu chăm sóc chuồng

**Luật / hành vi API mới**
1. `PATCH /horses/:horseId/lifecycle-status` sang `TRANSFERRED` hoặc `DECEASED` (kể cả bác sĩ đóng bệnh án kèm ghi nhận mất), trong cùng thao tác:

   | Dữ liệu | Hệ quả |
   | --- | --- |
   | Khẩu phần `ACTIVE` | Chuyển `ARCHIVED`, có `archivedAt` |
   | Khẩu phần `DRAFT` | Bị xóa |
   | Việc riêng (gắn thêm, miễn) đang chạy | `toDate` thành hôm nay |
   | Việc riêng chưa tới ngày bắt đầu | Bị xóa |
   | Checklist hôm nay `PENDING` / `IN_PROGRESS` | Chuyển `CANCELLED`, việc đã tick giữ nguyên |
   | Khẩu phần `ARCHIVED`, việc riêng đã kết thúc, checklist `COMPLETED` | Giữ nguyên |

   - Giải nghệ và đổi chủ nội bộ không đổi gì ở phần này. Không có thông báo mới.
2. Trạng thái checklist có thêm `CANCELLED`. `PATCH /checklist-items/:id` trên checklist `CANCELLED`: 409 "Checklist đã hủy vì ngựa đã chuyển nhượng hoặc đã mất, không sửa được".
3. `GET /horses/:horseId/lifecycle-status/preview` có thêm 5 field, luôn có mặt (0 hoặc `false` khi không áp dụng, vd giải nghệ): `feedingPlansArchived`, `draftFeedingPlansDeleted`, `careTasksEnded`, `careTasksDeleted` (số), `checklistCancelled` (boolean). `summary` tự nêu thêm các mục này.

**FE cần sửa**
- Thêm nhãn, màu cho checklist `CANCELLED` (vd "Đã hủy"), checklist này chỉ đọc: ẩn nút tick.
- Màn xác nhận đổi vòng đời hiện 5 số mới (hoặc dùng `summary`).

**Lý do**
- Trước đây ngựa đã đi hoặc đã mất vẫn còn khẩu phần, việc riêng chạy tiếp và checklist mở; Groom cũ vẫn tick được, hôm sau checklist bị đánh Chưa hoàn thành.

### B4: Ngày mất do hệ thống ghi, không nhập tay

**Luật / hành vi API mới**
1. `PATCH /horses/:horseId/lifecycle-status` sang `DECEASED`: bỏ `dateOfDeath` trong body. Ngày mất là ngày ghi nhận theo lịch CLB.
2. `POST /medical-cases/:caseId/close`: bỏ `dateOfDeath`, thay bằng `deceased` (boolean). `deceased: true` thì đóng bệnh án và ghi nhận ngựa mất, ngày mất là hôm nay; không gửi hoặc `false` là đóng bình thường. `deceased: true` vẫn không được gửi kèm `lockDecision`, `lockExpectedEnd` (400 ở ô tương ứng).
3. Gửi `dateOfDeath` ở hai route trên: 400 "Không nhận ô dateOfDeath". Các câu 400 cũ về ngày mất ("Cần nhập ngày mất", "Ngày mất không được ở tương lai"...) không còn.
4. Response hồ sơ ngựa vẫn có `dateOfDeath` để hiển thị.

**FE cần sửa**
- Bỏ ô nhập ngày mất ở màn ghi nhận mất và màn đóng bệnh án.
- Màn đóng bệnh án: lựa chọn "Ngựa đã mất" gửi `deceased: true`, vd `{ "finalConclusion": "Ngựa mất do suy tim", "deceased": true }`.

**Lý do**
- Ngày mất ghi lùi làm phí ngày vẫn bị tính cho những ngày sau ngày mất thật. Đề bài gốc cũng không yêu cầu nhập ngày mất.

### B5: Thời điểm khám do hệ thống ghi, không nhập lùi

**Luật / hành vi API mới**
1. `POST /horses/:horseId/medical-records` và `POST /medical-cases/:caseId/visits`: bỏ `examDate` trong body. Thời điểm khám là lúc lưu buổi khám.
2. Gửi `examDate`: 400 "Không nhận ô examDate". Các câu 400 "Thời điểm khám không được ở tương lai", "Chỉ được nhập lùi thời điểm khám tối đa 7 ngày", "Thời điểm khám không được sớm hơn ngày mở bệnh án" không còn.
3. Response buổi khám vẫn có `examDate`. Nhập số đo cơ thể ngoài buổi khám vẫn được lùi tối đa 7 ngày như cũ.

**FE cần sửa**
- Bỏ ô nhập thời điểm khám ở màn ghi buổi khám và màn tái khám.

**Lý do**
- Buổi khám ghi lùi vẫn ghi đè sức khỏe hiện tại dù đã có buổi mới hơn, và chi phí bị dời sang kỳ báo cáo cũ hoặc chủ cũ.

### B6: Đề xuất bổ sung không ghi số lượng, cấp theo số thực nhận, hủy được đề xuất đã duyệt

**Luật / hành vi API mới**

| Thao tác | Trước | Giờ |
| --- | --- | --- |
| GROOM, HT `POST /supplies/requests` | `{ itemId, quantity, note? }` | `{ itemId, note? }`; nhu cầu ghi vào `note` |
| Người gửi `PATCH /supplies/requests/:id` | Sửa `quantity`, `note` | Chỉ sửa `note` |
| CM `PATCH /supplies/requests/:id/status` với `FULFILLED` | Gửi `unitPrice`; tồn cộng số xin | Bắt buộc `quantity` (số thực nhận, > 0, tối đa 2 số lẻ) và `unitPrice`; tồn cộng đúng số thực nhận |
| CM `PATCH /supplies/requests/:id/status` với `CANCELLED` | Không có | Chỉ từ `APPROVED`, bắt buộc `reason` |

1. Gửi `quantity` khi tạo hoặc sửa: 400 "Không nhận ô quantity".
2. Hủy thiếu lý do: 400 "Hủy phải có lý do". Hủy đề xuất không ở `APPROVED`: 409 "Không thể chuyển đề xuất từ `<trạng thái>` sang CANCELLED". Người gửi không tự hủy được.
3. Response: `quantity` là số thực nhận, `null` khi chưa `FULFILLED`. Thêm `cancelledBy`, `canceller`, `cancelledAt`, `cancellationReason`; `rejectionReason` vẫn chỉ dùng cho Từ chối; người duyệt giữ nguyên khi hủy.
4. Đề xuất đã hủy không chặn xóa vật tư; còn đề xuất `PENDING`/`APPROVED` thì vẫn 409 "Vật tư còn đề xuất chưa xử lý".
5. Thông báo: người gửi nhận "Đề xuất bổ sung đã bị hủy" kèm lý do; thông báo Đã cấp ghi số thực nhận; thông báo đề xuất mới cho CM không còn số lượng.

**FE cần sửa**
- Bỏ ô số lượng ở màn gửi và sửa đề xuất.
- Màn cấp hàng của CM thêm ô số lượng thực nhận (bắt buộc), gửi `quantity` cùng `unitPrice`.
- Thêm trạng thái `CANCELLED` (bộ lọc, nhãn, màu); nút Hủy cho CM ở đề xuất `APPROVED`, kèm ô lý do bắt buộc.
- Hiển thị `quantity` có thể `null`; đề xuất đã hủy hiện người hủy, lúc hủy, lý do.

**Lý do**
- Xin 50 bao mà nhận 40 thì tồn vẫn tăng 50. Đề xuất đã duyệt mà nhà cung cấp hết hàng thì kẹt mãi và vật tư không xóa được.

### B7: Không lên lịch lớp và buổi tập ở quá khứ

**Luật / hành vi API mới**

| Thao tác | Luật mới | Lỗi |
| --- | --- | --- |
| `POST /classes` | `startDate` từ hôm nay trở đi theo lịch CLB; đúng hôm nay vẫn được | 400 ô `startDate` "Ngày bắt đầu không được ở quá khứ" |
| `PATCH /classes/:classId` | Chỉ kiểm khi gửi `startDate` khác ngày đang có | Như trên |
| `POST /classes/:classId/sessions` | `scheduledStartAt` phải sau thời điểm hiện tại; bằng đúng hiện tại cũng bị chặn | 400 ô `scheduledStartAt` "Giờ bắt đầu buổi tập phải sau thời điểm hiện tại" |
| `POST /classes/:classId/sessions/bulk` | Như trên, từng buổi; một buổi lỗi thì không lưu buổi nào | 400 ô `sessions.{i}.scheduledStartAt`, câu có tiền tố "Buổi {n}: " |
| `PATCH /training-sessions/:sessionId` | Chỉ kiểm khi đổi giờ bắt đầu | 400 ô `scheduledStartAt`, câu như trên |

- Sửa tên, ghi chú, địa điểm, chỉ giờ kết thúc... hoặc gửi lại đúng ngày bắt đầu cũ của lớp đã bắt đầu: không bị chặn.
- Luật này kiểm sau cùng: request vi phạm cả luật cũ thì vẫn nhận lỗi cũ (403, 409...).

Ví dụ bulk: `{ "message": "Buổi 2: Giờ bắt đầu buổi tập phải sau thời điểm hiện tại", "errors": [{ "field": "sessions.1.scheduledStartAt", "message": "Buổi 2: Giờ bắt đầu buổi tập phải sau thời điểm hiện tại" }] }`.

**FE cần sửa**
- Bộ chọn ngày bắt đầu lớp (tạo, sửa) chặn ngày trước hôm nay; vẫn hiện lỗi 400 ở ô `startDate`.
- Lịch xếp buổi (thêm, kéo đổi giờ, lặp lại nhiều buổi) không cho chọn giờ bắt đầu đã qua; hiện lỗi ở `scheduledStartAt` hoặc `sessions.{i}.scheduledStartAt`.
- Gửi `startDate` đúng `YYYY-MM-DD` (gửi kèm giờ là 400, xem "Chuẩn thời gian").

**Lý do**
- Buổi tạo ở quá khứ bị job tự đóng buổi đánh Vắng mọi lượt, cho một buổi chưa từng diễn ra. Hệ thống không có nhập bù buổi đã qua.

### B9: Ngựa có việc chăm sóc riêng hoặc phụ phí thì không xóa hồ sơ được

**Luật / hành vi API mới**
1. `DELETE /horses/:horseId`: ngựa đã có việc chăm sóc riêng (gắn thêm hoặc miễn) hoặc phụ phí chăm sóc, kể cả dòng đã kết thúc: 409 "Ngựa đã phát sinh dữ liệu nghiệp vụ (việc chăm sóc riêng, phụ phí chăm sóc), hãy đổi trạng thái vòng đời thay vì xóa".
2. `GET /horses/:horseId/deletion-preview`: `allowed = false`, `businessData` có thêm hai nhãn "việc chăm sóc riêng", "phụ phí chăm sóc".

**FE cần sửa**
- Không đổi request/response. Hiện hai nhãn mới trong `businessData` và câu 409 như các nhãn đang có.

**Lý do**
- Hai loại dữ liệu này là dữ liệu nghiệp vụ như các dữ liệu khác, xóa hồ sơ sẽ mất lịch sử chăm sóc và phí.

### F1-6: Khôi phục hồ sơ đã xóa thì tính lại phí, xem trước báo số tiền

**Luật / hành vi API mới**
1. Khôi phục hồ sơ: báo cáo tính lại phí ngày và phụ phí của những ngày hồ sơ bị xóa (từ ngày xóa tới hôm nay) cho chủ trong thời gian đó; ngựa không có chủ thì vào mục `unowned` của báo cáo CLB. Ngày chưa có mức phí ngày thì không tính.
2. `GET /horses/:horseId/restore-preview` có thêm `rebilledDays`, `rebilledDailyFee`, `rebilledSurcharge` (VND) và `rebilledOwnerName` (null khi ngựa không có chủ).
3. `summary` thêm câu "Báo cáo phí sẽ tính lại cho chủ X: phí ngày N ngày (... đ), phụ phí ... đ." (không có chủ: "vào mục Chưa có chủ"); không có phí thì không thêm câu.

**FE cần sửa**
- Hiện số tiền tính lại ở bảng xác nhận khôi phục (hoặc dùng `summary`).

**Lý do**
- Khôi phục nghĩa là đã xóa nhầm: ngựa vẫn ở CLB và vẫn thuộc chủ, CM cần biết trước số tiền sẽ tính lại.

### B10: Buổi chạy thử, loại buổi theo môn, mục tiêu nằm trên buổi

**Luật / hành vi API mới**
1. `PATCH /training-sessions/:sessionId`:
   - Không nhận `sessionType` nữa, gửi lên là 400. Loại buổi luôn theo môn: đổi `subjectId` sang môn chạy thử thì buổi thành chạy thử và ghi được kết quả; đổi sang môn thường thì thành buổi thường.
   - Nhận thêm `targetTimeMs` (số ms hoặc `null`), kiểm như khi thêm buổi. Buổi thường gửi số là 400 "Chỉ môn chạy thử mới có thời gian mục tiêu". Đổi sang môn chạy thử mà cự ly 0 là 400 "Môn chạy thử phải có cự ly lớn hơn 0".
   - Không gửi `targetTimeMs` thì giữ giá trị cũ. Buổi đổi sang môn thường thì tự về `null`. Gửi `null` để bỏ mục tiêu.
   - Câu 409 "Không thể đổi về buổi thường khi đã có cấu hình chạy thử" không còn.
2. Response buổi tập (`GET /classes/:classId/sessions`, `GET /training-sessions/:sessionId`, `POST`, `PATCH`...) có thêm `targetTimeMs` (`null` là không có mục tiêu, buổi thường luôn `null`).
3. Bỏ 4 API cấu hình chạy thử: `GET`, `POST`, `PATCH /training-sessions/:id/time-trial` và `GET /time-trials/:id`. Cự ly chạy thử là `plannedDistanceM` của buổi; ghi chú chạy thử là `notes` của buổi (dữ liệu cũ đã được gộp vào đó).
4. `POST /session-participants/:id/trial-results`: không còn 404 "Buổi tập chưa có cấu hình chạy thử".
5. Kết quả chạy thử (`GET/POST /session-participants/:id/trial-results`, `PATCH .../trial-results/:attemptNo`) bỏ field `timeTrialId`.

**FE cần sửa**
- Bỏ gửi `sessionType` khi sửa buổi; ô thời gian mục tiêu gửi `targetTimeMs` trên chính route sửa buổi.
- Bỏ màn/lời gọi cấu hình chạy thử riêng và field `timeTrialId`.

**Lý do**
- Đổi môn không đổi loại buổi nên buổi chạy thử không ghi được kết quả; cự ly lưu hai nơi nên có thể lệch nhau.

### B11: Lớp quá ngày kết thúc tự hoàn thành

**Luật / hành vi API mới**
1. Lớp `ACTIVE` có `endDate` trước hôm nay (lịch CLB) và không còn buổi `SCHEDULED`/`IN_PROGRESS` thì hệ thống tự chuyển `COMPLETED` trong vòng một phút. Ngựa đang học chuyển `LEFT`.
2. Không gửi thông báo. Nhật ký lớp có dòng người thao tác trống, lý do "Hệ thống tự hoàn thành lớp".

**FE cần sửa**
- Trạng thái lớp có thể đổi mà không có thao tác của người dùng: tải lại lớp thay vì giữ trạng thái cũ trong cache.

**Lý do**
- HT quên bấm hoàn thành thì lớp đã qua ngày kết thúc vẫn `ACTIVE`, chặn CM đổi HT khu chuồng và chặn khóa tài khoản HT.

### B13: Khóa tài khoản Groom còn lượt dắt

**Luật / hành vi API mới**
1. Khóa tài khoản (`PATCH /users/:id/status`) hoặc đổi vai trò (`PATCH /users/:id`) Groom còn lượt tập chưa diễn ra được giao dắt (kể cả dắt hộ; lượt Chờ điểm danh, Có mặt, Sẵn sàng, Đang tập ở buổi `SCHEDULED`/`IN_PROGRESS`): 409 `Người này còn N lượt tập được giao dắt chưa diễn ra, cần nhờ Huấn luyện viên trưởng giao lại trước khi khóa tài khoản` (đổi vai trò thì kết thúc bằng "trước khi đổi vai trò").

**FE cần sửa**
- Hiện câu 409 ở màn khóa tài khoản và đổi vai trò.

**Lý do**
- Trước đây Groom dắt hộ vẫn bị khóa được, lượt tập giữ người dắt đã khóa rồi bị đánh Vắng.

### B15: Sửa vật tư đã có nhập xuất kho

**Luật / hành vi API mới**
1. `PATCH /supplies/items/:id`: vật tư đã nhập hàng, xuất dùng hoặc hủy lần xuất mà đổi `unit` hoặc `category`: 409 `Vật tư đã có nhập xuất kho, không đổi được đơn vị. Hãy tạo vật tư mới` (đổi loại: `... không đổi được loại. Hãy tạo vật tư mới`), `errors[0].field` là `unit` hoặc `category` (đổi cả hai thì `unit`).
2. Vật tư chỉ có tồn ban đầu vẫn đổi được. Gửi đúng giá trị đang có không lỗi. Tên, ngưỡng sửa như cũ.

**FE cần sửa**
- Hiện lỗi 409 ở đúng ô `unit`/`category`; gợi ý tạo vật tư mới.

**Lý do**
- Đổi đơn vị làm sổ và tồn cũ đọc theo đơn vị mới (500 kg thành 500 bao); đổi loại khỏi thuốc thì Groom lấy được thuốc.

### F1-2: Danh sách ngựa, ngựa đã chuyển đi, đã mất xếp cuối

**Luật / hành vi API mới**
1. `GET /horses` với `sortBy=HEALTH_PRIORITY` (mặc định): ngựa `TRANSFERRED`/`DECEASED` luôn xếp sau mọi ngựa còn lại, bất kể `healthStatus` (`sortOrder=DESC` thì lên đầu). Request, response không đổi.

**FE cần sửa**
- Không đổi API. Không tự sắp lại danh sách phía FE.

**Lý do**
- Ngựa đã mất còn ghi Chấn thương đứng đầu danh sách, trên ngựa đang sống cần xử lý.

### F1-3: Danh sách ngựa, thêm tình trạng "Chờ giao Groom"

**Luật / hành vi API mới**
1. `placementStatus` (response `location.placementStatus` của `GET /horses`, `GET /horses/:id` và bộ lọc `GET /horses?placementStatus=`) có thêm `PENDING_GROOM`: đã có khu và ô nhưng chưa có Groom phụ trách. `PLACED` giờ là đủ khu, ô và Groom; ngựa trước đây `PLACED` mà chưa có Groom nay là `PENDING_GROOM`.

**FE cần sửa**
- Thêm nhãn, màu và lựa chọn bộ lọc cho `PENDING_GROOM` (vd "Chờ giao Groom").

**Lý do**
- HT không lọc ra được ngựa đã có chỗ mà chưa ai chăm.

### OB-8, F2-1, F2-13: Không đổi API

**Luật / hành vi API mới**
1. OB-8: thông báo y tế (khóa/gỡ khóa huấn luyện, đổi sức khỏe, mở/hủy/đóng bệnh án) gửi cho chủ lúc xảy ra sự kiện. Ngựa đã đổi chủ trước khi gửi thì chủ cũ nhận với `resource = null`, chủ mới không nhận.
2. F2-1: ngựa rời lớp hoặc bị rút khỏi lớp thì cả lượt Hủy do khóa và Không đủ điều kiện ở các buổi sau đó cũng chuyển Đã hủy, kèm lý do rời lớp.
3. F2-13: gỡ khóa hoặc đổi sức khỏe thì lượt ở buổi `IN_PROGRESS` chưa tới giờ bắt đầu cũng được chấm lại (vd về Chờ điểm danh).

**FE cần sửa**
- Không. Request, response, mã lỗi giữ nguyên.

**Lý do**
- Chủ mới từng nhận dữ liệu y tế của chủ cũ; ngựa đã rời lớp vẫn giữ chỗ và bị đánh Vắng; ngựa gỡ khóa sau lúc buổi bắt đầu sớm bị kẹt ở Hủy do khóa.

## Ngày 18/10/2026

### Dừng sớm lượt tập

**Luật / hành vi API mới**
1. Trạng thái lượt tập mới `STOPPED` (dừng sớm), là trạng thái kết thúc như `COMPLETED`: không điểm danh, bắt đầu, giao Groom lại; vẫn ghi kết quả chạy thử và đánh giá được.
2. Route mới `POST /session-participants/:id/stop` (HT), body `{ "reason": "Ngựa đi khập khiễng" }`:
   - Lý do bắt buộc, 1–500 ký tự sau khi cắt khoảng trắng; trống thì 400.
   - Chỉ lượt `ONGOING` của buổi `IN_PROGRESS`, không thì 409. Quyền như `/complete`.
   - Response như `/complete`: `status = STOPPED`, `completedAt` là giờ dừng. Lượt cuối còn mở dừng thì buổi tự đóng `COMPLETED`.
3. Field mới `stoppedReason` (null nếu không dừng sớm) ở:
   - Response các route `/session-participants/:id/*` và `GET /training-sessions/:sessionId/participants`.
   - `GET /horses/:horseId/training/sessions` (lượt dừng sớm nằm ở `when=history`).
   - `GET /grooms/me/today` → `trainingRuns[]` (lượt dừng sớm vẫn hiện).
4. Đếm riêng lượt dừng sớm:
   - `GET /horses/:id/workload`: thêm `sessionsStopped`. `sessionsCompleted`, `byIntensity`, `plannedDistanceM` chỉ tính lượt hoàn thành; `actualDurationSeconds`, `actualDistanceM` cộng cả lượt dừng sớm.
   - `GET /reports/horses/:horseId/progress`: thêm `totals.stopped` và `weekly[].stopped`; `trainedMinutes` cộng cả lượt dừng sớm, `completed` và `plannedDistanceM` thì không.
   - `GET /reports/dashboard`: thêm `training.stopped` và `weekly[].stopped`.

**FE cần sửa**
- Thêm nút "Dừng sớm" kèm ô lý do ở lượt `ONGOING`.
- Thêm nhãn và màu cho `STOPPED` ở mọi chỗ hiển thị trạng thái lượt; hiện `stoppedReason` và các số đếm mới.

**Lý do**
- HT cần dừng một ngựa giữa buổi (vd đi khập khiễng) mà không đánh dấu là hoàn thành.

### Bỏ ngưỡng nhịp tim/tốc độ riêng từng ngựa

**Luật / hành vi API mới**
1. Bỏ route `PUT /horses/:id/thresholds` (gọi vào trả 404).
2. `GET /horses/:id/thresholds` giữ nguyên quyền (HT của khu, CM, VET) nhưng đổi response, mọi ngựa dùng chung một bộ ngưỡng CLB:

   ```json
   {
     "horseId": "uuid",
     "limits": { "heartRateWarningBpm": 220, "heartRateCriticalBpm": 240, "maxSpeedMps": 18 }
   }
   ```

   Bỏ `source`, `profiles`; `activeLimits` đổi tên thành `limits`.
3. Nhật ký thao tác: bỏ giá trị `feature = PERF_THRESHOLD` và `entityType = PERFORMANCE_THRESHOLD`.

**FE cần sửa**
- Bỏ màn/nút đặt ngưỡng; đọc `limits` thay cho `activeLimits`.
- Xóa hai giá trị nhật ký trên khỏi bộ lọc và bảng nhãn.

**Lý do**
- Không có cảm biến thật, số đo là giả lập; ngưỡng chung CLB là đủ.

### Sửa kết quả chạy thử và đánh giá sau buổi

**Luật / hành vi API mới**
1. ~~HT sửa được tới 7 ngày sau giờ kết thúc dự kiến của buổi~~ (đã thay ở 19/10, xem B2: không giới hạn thời gian). Buổi đã hủy thì 409. Lượt `COMPLETED` và `STOPPED` sửa như nhau. Không báo chủ ngựa.
2. `PATCH /session-participants/:id/trial-results/:attemptNo` (HT của lớp) nhận thêm `elapsedMs`, `notes`, `reason`; mọi field đều tùy chọn, bỏ trống là giữ nguyên:

   ```json
   { "elapsedMs": 75000, "notes": "Bấm lại theo video", "reason": "Bấm giờ nhầm" }
   ```

   - Body cũ `{ "videoMediaId": "uuid" }` hoặc `{ "videoMediaId": null }` chạy như trước, không cần `reason`.
   - Gửi `elapsedMs` (1–3.600.000) hoặc `notes` (null để xóa) thì bắt buộc `reason` 1–500 ký tự sau khi cắt khoảng trắng; thiếu hoặc trống là 400.
   - Body `{}` trước đây là 400, giờ trả 200 và không đổi gì.
   - Không sửa `attemptNo`, không xóa lần chạy.
   - Schema request đổi tên `UpdateTrialResultVideoDto` → `UpdateTrialResultDto`.
3. Route mới `PATCH /session-participants/:id/evaluation` (HT phụ trách lớp, ngựa thuộc khu mình), response như `GET`:

   ```json
   { "score": 8, "comment": null, "reason": "Chấm nhầm" }
   ```

   - `reason` bắt buộc 1–500 ký tự; `score` 1–10 và `comment` (null để xóa) tùy chọn. Lượt chưa có đánh giá là 404.
4. Câu 409 buổi đã hủy chung cho cả 3 thao tác: "Buổi tập đã hủy, không sửa kết quả được". ~~"Quá hạn sửa kết quả buổi tập"~~ (đã bỏ ở 19/10, xem B2).
5. Báo cáo tiến độ ngựa (`bestTrialMs`, `evaluation`) tự lấy giá trị mới sau khi sửa. Nhật ký thao tác ghi giá trị trước, sau và `reason` (`feature = TIME_TRIAL` / `PERF_EVAL`, `action = UPDATE`).

**FE cần sửa**
- Form sửa lần chạy thử: thêm ô thời gian, ghi chú, lý do (bắt buộc khi sửa thời gian hoặc ghi chú).
- Thêm form sửa đánh giá gọi route mới, ô lý do bắt buộc.

**Lý do**
- HT bấm giờ hoặc chấm điểm nhầm cần sửa được, có lý do và nhật ký.

### Groom biết đúng việc, đúng giờ, đúng chỗ

**Luật / hành vi API mới**
1. `GET /grooms/me/today`: mỗi lượt trong `horses[].trainingRuns` có thêm `location`, `surface` (chuỗi hoặc null) của buổi.
2. Thêm mảng `assistedRuns`: lượt hôm nay Groom được giao dắt ở ngựa Groom không phụ trách, theo giờ bắt đầu, cùng field với `trainingRuns` kèm `horseId`, `horseName`. Groom không phụ trách ngựa nào vẫn có mảng này.

   ```json
   {
     "date": "2026-10-18",
     "horses": [],
     "otherCareSchedules": [],
     "assistedRuns": [
       {
         "participantId": "uuid", "sessionId": "uuid", "sessionName": "Sức bền sáng",
         "scheduledStartAt": "2026-10-17T23:00:00.000Z", "scheduledEndAt": "2026-10-18T00:00:00.000Z",
         "location": "Sân 1", "surface": "Cát", "status": "PLANNED", "stoppedReason": null,
         "horseId": "uuid", "horseName": "Sấm"
       }
     ]
   }
   ```

3. 409 mới khi `PATCH /session-participants/:id/groom`: "Groom đang dắt ngựa Sấm ở buổi "Sức bền" lúc 06:30 ngày 19/10/2026, trùng giờ với lượt này".
4. 409 mới khi `PUT /horses/:id/groom` và `PUT /horses/:id/placement`: "Groom mới đang dắt lượt trùng giờ: buổi "Sáng" lúc 06:00 ngày 19/10/2026 trùng lượt ngựa Sấm ở buổi "Sức bền" lúc 06:30 ngày 19/10/2026. Giao lại người dắt các lượt này trước khi đổi Groom" (nhiều cặp nối bằng "; "). Không lưu gì.
5. 409 mới khi thêm buổi (`POST /classes/:classId/sessions`, `.../sessions/bulk`), sửa buổi (`PATCH /training-sessions/:sessionId`) và ghi danh (`POST /classes/:classId/enrollments`) nếu người dắt của một lượt bị trùng giờ: "Người dắt bị trùng giờ: ngựa Gió ở buổi "Buổi mới" lúc 08:30 ngày 10/01/2030 trùng lượt ngựa Sấm ở buổi "Buổi" lúc 08:00 ngày 10/01/2030. Giao lại người dắt các lượt này trước". Không lưu gì. Thêm nhiều buổi thì câu báo có tiền tố "Buổi {n}: ".
6. Sửa buổi giờ giữ nguyên người dắt HT đã giao tay (trước đây bị gắn lại Groom phụ trách).
7. Thông báo mới cho Groom khi HT giao dắt một lượt: `category = TRAINING_SESSION`, mức `NORMAL`, `resource = null`, vd "Bạn được giao dắt Gió ở buổi tập Sáng lúc 06:00 ngày 19/10/2026, tại Sân 1, mặt sân Cát.". Gỡ người dắt không có thông báo.

**FE cần sửa**
- Màn Hôm nay của Groom: hiện `location`, `surface` và khối `assistedRuns`.
- Hiện các câu 409 trùng giờ người dắt để HT giao lại trước.

**Lý do**
- Groom dắt hộ không thấy lượt của mình, không biết sân nào, và một Groom bị giao hai lượt cùng giờ.

### Ngựa Chấn thương/Cách ly chưa có bệnh án và thông báo Cách ly

**Luật / hành vi API mới**
1. `GET /medical/dashboard` có thêm mảng `horsesWithoutCase`: ngựa đang `INJURED` hoặc `QUARANTINED` mà không có bệnh án đang mở. Cùng bộ lọc `barnId`, `mine`, `healthStatus` như các khối khác; không có ngựa đã chuyển nhượng, đã mất, hồ sơ đã xóa. Xếp Cách ly trước, rồi con chuyển trạng thái lâu nhất trước.

   ```json
   {
     "horsesWithoutCase": [
       {
         "horseId": "uuid", "horseName": "Gió",
         "barnId": "uuid", "barnName": "Khu A",
         "stallId": "uuid", "stallCode": "A-01",
         "healthStatus": "QUARANTINED",
         "since": "2026-10-15T02:00:00.000Z"
       }
     ]
   }
   ```

   `since` là lúc chuyển sang trạng thái hiện tại, `null` nếu nhật ký không có.
2. Thông báo Cách ly (`category = HEALTH_STATUS`, mức `HIGH`) gửi HT, CM, Groom có thêm câu cuối liệt kê ngựa có thể đã tiếp xúc, tối đa 10 tên, vd: "... Ngựa có thể đã tiếp xúc: Mây (cùng khu), Sương (cùng khu, cùng Groom), Lúa (cùng Groom) và 2 con khác.". Thông báo của chủ giữ nội dung cũ. API `PATCH health-status` không đổi.

**FE cần sửa**
- Thêm khối `horsesWithoutCase` trên dashboard y tế. Mỗi dòng gợi ý nút "Lập phiếu khám" (form `POST /horses/:horseId/medical-records`) và nút đổi sức khỏe (`PATCH /horses/:horseId/health-status`) khi đặt nhầm hoặc đã ổn.

**Lý do**
- Ngựa bị đặt Chấn thương/Cách ly mà chưa ai lập bệnh án thì không hiện ở đâu để bác sĩ xử lý.

### Bác sĩ gắn, miễn, gỡ việc riêng của ngựa

**Luật / hành vi API mới**
1. VET được gọi thêm các route việc riêng, cho mọi ngựa trong CLB (không giới hạn khu, kể cả ngựa chưa xếp khu). Body, response, mã lỗi không đổi:
   - `GET /horses/:horseId/care-tasks`: CM, HT (khu mình), VET, GROOM (ngựa mình phụ trách).
   - `POST /horses/:horseId/care-tasks`, `DELETE /horse-care-tasks/:id`: HT (khu mình), VET.
2. HT giữ nguyên phạm vi khu. Khẩu phần (`feeding-plans`) không đổi, vẫn chỉ HT.
3. Bác sĩ đổi thì HT của khu nhận thông báo `category = DAILY_CHECKLIST`, mức `NORMAL`, tiêu đề "Bác sĩ đổi việc riêng của ngựa", vd: `Bác sĩ Lan miễn việc "Tắm rửa" (từ 18/10/2026 đến 20/10/2026) cho ngựa Gió. Lý do: Đang sốt, kiêng tắm.`. HT tự làm thì không có thông báo này.

**FE cần sửa**
- Mở màn việc riêng của ngựa cho VET.

**Lý do**
- Bác sĩ là người biết ngựa cần kiêng việc gì (vd sốt không tắm).

### Chi phí y tế theo từng buổi khám

**Luật / hành vi API mới**
1. Buổi khám có thêm `cost` (VND, số nguyên ≥ 0, tối đa 10 tỷ), tùy chọn, bỏ trống là 0:
   - Body `POST /horses/:horseId/medical-records` và `POST /medical-cases/:caseId/visits` nhận `cost`.
   - Response buổi khám (`GET /horses/:horseId/medical-records`, `GET /medical-records/:id`, `visits` trong `GET /medical-cases/:caseId`, response ghi/hủy buổi khám) có `cost` và `costHidden`.
   - HT: không có key `cost`, `costHidden`.
   - OWNER: buổi khám thuộc giai đoạn chủ khác sở hữu có `cost = null`, `costHidden = true`. Buổi của mình hiện số ngay, không chờ bệnh án đóng.
2. Đóng bệnh án `POST /medical-cases/:caseId/close` **bỏ** `totalCost` trong body (gửi lên là 400).
3. Bệnh án:
   - `totalCost` = tổng `cost` các buổi khám chưa hủy, có cả khi bệnh án đang điều trị (không còn `null`). OWNER chỉ được cộng phần của mình.
   - **Bỏ** `costHidden` ở cấp bệnh án; dùng `costHidden` của từng buổi.
   - `totalCost` của `GET /horses/:horseId/medical-cases` = tổng mọi buổi khám chưa hủy của ngựa, trong và ngoài bệnh án.
4. **Bỏ** `PATCH /medical-cases/:caseId/cost`. **Thay bằng** `PATCH /medical-records/:id/cost` (chỉ VET):

   ```json
   { "cost": 1500000, "reason": "Gõ thừa số 0" }
   ```

   - Trả buổi khám (như `GET /medical-records/:id`). Bệnh án đang mở hay đã đóng đều sửa được, không giới hạn thời gian.
   - Số trùng số cũ: 200, không ghi nhật ký, không báo ai.
   - Buổi khám đã hủy, ngựa đã chuyển nhượng hoặc đã mất: 409. Không có buổi khám: 404.
   - Thông báo `category = MEDICAL_CASE`, mức `NORMAL`, tiêu đề "Điều chỉnh chi phí khám ngựa X", vd: "Chi phí buổi khám ngày 20/05/2026 của ngựa Gió được điều chỉnh từ 15.000.000 đ thành 1.500.000 đ.". Gửi CM và chủ của giai đoạn chứa ngày khám. `resource` là bệnh án; buổi khám ngoài bệnh án thì `resource.type = HORSE`. Chủ đó không còn là chủ hiện tại thì nhận với `resource = null` (chỉ khi tài khoản chủ còn hoạt động).
5. Thông báo đóng bệnh án: CM nhận "Tổng chi phí điều trị: …" (cả bệnh án), chủ nhận "Chi phí điều trị của bạn: …" (phần thuộc giai đoạn mình sở hữu).
6. Báo cáo:
   - `GET /medical/cost-report` lọc theo **ngày khám** (không còn theo ngày đóng), gồm cả buổi khám ngoài bệnh án. Đổi `caseCount` thành `visitCount` ở tổng và từng dòng. `ownerId` lọc theo chủ của giai đoạn chứa ngày khám; `barnId` vẫn theo khu hiện tại.
   - `GET /reports/owner/costs`, `GET /reports/club/finance`: `medicalCost` tính theo ngày khám; từng ngựa đổi `caseCount` thành `visitCount`.
7. Chuyển chủ nội bộ `POST /horses/:horseId/ownership-transfers` không còn 409 khi ngựa đang có bệnh án mở. Bán ra ngoài và ghi nhận mất khi còn bệnh án mở vẫn 409 như cũ.

**FE cần sửa**
- Thêm ô chi phí ở form khám và tái khám; bỏ ô chi phí ở form đóng bệnh án.
- Màn sửa chi phí chuyển sang từng buổi khám (`PATCH /medical-records/:id/cost`, ô lý do).
- OWNER: buổi có `costHidden = true` hiện "Chi phí thuộc chủ khác". Đổi `caseCount` → `visitCount` ở các báo cáo.

**Lý do**
- Chi phí gắn với buổi khám mới chia đúng cho từng chủ khi ngựa đổi chủ giữa đợt điều trị.

### Hủy buổi khám: chỉ bác sĩ ghi phiếu

**Luật / hành vi API mới**
1. `POST /medical-records/:id/void`: bác sĩ hủy buổi khám do bác sĩ khác ghi: 403 "Chỉ bác sĩ ghi phiếu khám mới được hủy phiếu này". `PATCH /medical-records/:id/cost` không đổi.

**FE cần sửa**
- Ẩn nút hủy phiếu khám với bác sĩ không phải người ghi.

**Lý do**
- Phiếu khám là hồ sơ chuyên môn của người ghi.

### Head Trainer không có hai buổi trùng giờ ở hai lớp

**Luật / hành vi API mới**
1. 409 khi thêm buổi (`POST /classes/:classId/sessions`, `.../sessions/bulk`) và đổi giờ buổi (`PATCH /training-sessions/:sessionId`) nếu HT của lớp đã có buổi chưa hủy trùng giờ ở lớp khác của mình: "Trùng giờ với lịch của Huấn luyện viên trưởng: lớp KD-02, 06:00 ngày 10/10/2026". Không lưu gì. Thêm nhiều buổi thì câu có tiền tố "Buổi {n}: ".
2. 409 khi `POST /users/:id/head-trainer-handover` nếu buổi của lớp được chuyển trùng giờ với buổi ở lớp của HT nhận: "Huấn luyện viên trưởng nhận có buổi trùng giờ: lớp KD-01 lúc 06:00 ngày 10/10/2026 trùng lớp KD-05 lúc 06:30 ngày 10/10/2026. Đổi giờ các buổi này trước khi bàn giao" (nhiều cặp nối bằng "; "). Không chuyển gì.

**FE cần sửa**
- Hiện các câu 409 trên ở lịch xếp buổi và màn bàn giao HT.

**Lý do**
- Một HT không đứng hai buổi cùng lúc.

### Chấn thương theo từng vết, theo dõi qua các buổi khám

**Luật / hành vi API mới**

Mỗi vết chấn thương có mã riêng (`injuryId`) và sống qua nhiều buổi khám. Vị trí, vùng, loại cố định lúc phát hiện; mỗi buổi khám chỉ ghi mức hồi phục mới. Dữ liệu cũ đã được gom thành vết theo (ngựa, bệnh án, vùng, loại).

1. Body buổi khám (`POST /horses/:horseId/medical-records`, `POST /medical-cases/:caseId/visits`): bỏ `injuries`, thay bằng hai danh sách (mỗi danh sách tối đa 20 dòng):

   ```json
   {
     "injuryUpdates": [
       { "injuryId": "uuid", "recoveryStatus": "RECOVERING", "notes": "Bớt sưng" }
     ],
     "newInjuries": [
       { "bodyRegion": "LEFT_FRONT_LEG", "injuryType": "SPRAIN", "position": { "x": 0.1, "y": 0.2, "z": 0 }, "recoveryStatus": "ACUTE", "notes": "Cổ chân" }
     ]
   }
   ```

   - Vết mới bắt buộc `position` `{ x, y, z }` (số); thiếu, `null` hoặc thiếu một trục là 400. `injuryUpdates[]` không gửi `position`.
   - Vết không gửi trong buổi khám giữ nguyên mức cũ. Hai vết mới cùng vùng và cùng loại ghi được.
   - Lỗi mới: 400 "Mỗi chấn thương chỉ cập nhật một lần trong một buổi khám"; 400 "Chấn thương không thuộc con ngựa này" (mã của ngựa khác hoặc vết đã ẩn); 409 "Chấn thương đã lành, không cập nhật được; tái phát thì ghi chấn thương mới".
   - Như cũ: chỉ buổi khám thuộc bệnh án hoặc buổi kết luận Có vấn đề mới gửi được hai danh sách này; buổi ngoài bệnh án kết luận Bình thường gửi thì 400.
2. Response buổi khám (`injuries[]`): mỗi dòng có thêm `injuryId`. `bodyRegion`, `injuryType`, `position` lấy từ vết; `recoveryStatus`, `notes` là của buổi khám đó.
3. `GET /horses/:horseId/injuries` đổi shape: mỗi phần tử là một vết, xếp theo lần khám sớm nhất. Query mới `unhealedOnly=true` chỉ lấy vết chưa lành.

   ```json
   [
     {
       "id": "uuid", "horseId": "uuid",
       "bodyRegion": "LEFT_FRONT_LEG", "injuryType": "SPRAIN", "position": { "x": 0.1, "y": 0.2, "z": 0 },
       "firstMedicalRecordId": "uuid", "firstExamDate": "2026-10-10T02:00:00.000Z",
       "currentRecoveryStatus": "RECOVERING",
       "history": [
         { "medicalRecordId": "uuid", "examDate": "2026-10-10T02:00:00.000Z", "caseId": "uuid", "recoveryStatus": "ACUTE", "notes": "Cổ chân" },
         { "medicalRecordId": "uuid", "examDate": "2026-10-14T02:00:00.000Z", "caseId": "uuid", "recoveryStatus": "RECOVERING", "notes": "Bớt sưng" }
       ]
     }
   ]
   ```

   - `currentRecoveryStatus` là mức ở lần khám mới nhất chưa hủy. `history` tăng dần theo ngày khám, chỉ gồm buổi chưa hủy.
   - Hủy buổi khám: mức của các vết buổi đó đã cập nhật quay về mức trước. Vết không còn buổi khám chưa hủy nào biến mất khỏi danh sách.
4. Đóng bệnh án (`POST /medical-cases/:caseId/close`): 409 "Còn chấn thương chưa lành, hãy ghi buổi khám đánh dấu đã lành trước khi đóng bệnh án". Đóng kèm `deceased: true` (ghi nhận mất, xem B4 ngày 19/10) thì không bị chặn. `GET /medical-cases/:caseId/close-preview` có thêm `unhealedInjuryCount`.

**FE cần sửa**
- Form khám: mở form gọi `GET /horses/:horseId/injuries?unhealedOnly=true`, hiện vết đang theo dõi trên mô hình 3D; từng vết chọn mức mới (đưa vào `injuryUpdates`) hoặc bỏ qua; vết mới chạm mô hình lấy `position`, chọn vùng, loại, mức (đưa vào `newInjuries`).
- Màn 3D: mặc định `unhealedOnly=true`, tô màu theo `currentRecoveryStatus`, có nút xem cả vết đã lành, bấm điểm hiện `history`.
- Đóng bệnh án: `unhealedInjuryCount` > 0 thì báo trước và gợi ý ghi buổi tái khám đánh dấu Đã lành.

**Lý do**
- Một vết cần theo dõi hồi phục qua nhiều buổi khám, không phải ghi lại từ đầu mỗi buổi.

### Head Trainer xem mọi khu chuồng

**Luật / hành vi API mới**
1. `GET /barns` và `GET /medical/dashboard` trả mọi khu cho HT (trước đây chỉ khu HT phụ trách).
2. Cả hai nhận thêm query `mine=true` (tùy chọn, mọi vai trò): chỉ các khu người gọi phụ trách.
3. `GET /medical/dashboard?barnId=...` chọn khu không do HT phụ trách không còn 403. Gửi cùng `mine=true` thì lấy phần giao: khu không do người gọi phụ trách thì đàn rỗng.

**FE cần sửa**
- Thêm bộ lọc "Khu của tôi" gửi `mine=true`.

**Lý do**
- HT cần nhìn toàn CLB; thao tác ghi vẫn giới hạn theo khu.

### Tiêm phòng, tẩy giun chỉ giao bác sĩ

**Luật / hành vi API mới**
1. `POST /horses/:horseId/care-schedules` và `PATCH /care-schedules/:id` (khi đổi cách giao): lịch Tiêm phòng hoặc Tẩy giun giao Groom (`assigneeType: GROOM`): 400 ô `assigneeType` "Tiêm phòng, tẩy giun chỉ giao được cho bác sĩ". Kiểm tra móng vẫn giao Groom hoặc bác sĩ như cũ.
2. Sửa lịch mà không đổi cách giao (dời ngày, ghi chú) không bị kiểm luật này.

**FE cần sửa**
- Ẩn lựa chọn Groom khi loại lịch là Tiêm phòng hoặc Tẩy giun.

**Lý do**
- Tiêm, tẩy giun là việc chuyên môn của bác sĩ.

### Xuất kho thuốc và ghi chú lần xuất

**Luật / hành vi API mới**
1. `POST /supplies/items/:id/usages` với vật tư loại thuốc (`MEDICINE`): chỉ VET và CM xuất được; HT, GROOM nhận 403 "Chỉ Veterinarian hoặc Club Manager được xuất thuốc".
2. Mọi lần xuất bắt buộc `note` (tối đa 500 ký tự). Thiếu hoặc toàn khoảng trắng: 400 ô `note` "Phải ghi chú lần xuất".

**FE cần sửa**
- Ẩn nút xuất ở vật tư loại thuốc với HT, GROOM. Ô ghi chú lần xuất thành bắt buộc.

**Lý do**
- Thuốc cần kiểm soát người lấy; ghi chú để truy ra mỗi lần xuất dùng vào việc gì.

### Bảng điều khiển y tế: khối Thuốc cần cho hôm nay

**Luật / hành vi API mới**
1. `GET /medical/dashboard` có thêm `todayPrescriptions`: các đơn thuốc đang hiệu lực hôm nay theo lịch CLB, xếp theo tên ngựa rồi tên thuốc. Mỗi dòng `{ prescriptionId, horseId, horseName, medicine, dosage, frequency, startDate, endDate (null nếu dùng tới khi đóng bệnh án), medicalRecordId, caseId (null nếu buổi khám ngoài bệnh án) }`.
2. Bộ lọc `barnId`, `mine`, `healthStatus` áp cho khối này; đơn của buổi khám đã hủy không hiện.

**FE cần sửa**
- Thêm khối "Thuốc cần cho hôm nay" trên dashboard y tế.

**Lý do**
- Bác sĩ cần thấy ngay trong ngày ngựa nào cần cho thuốc gì.

### Đơn thuốc của buổi khám không mở bệnh án phải có ngày kết thúc

**Luật / hành vi API mới**
1. `POST /horses/:horseId/medical-records` mà buổi khám không mở bệnh án: mọi dòng `prescriptions` bắt buộc có `endDate`. Thiếu: 400 "Đơn thuốc của buổi khám không mở bệnh án phải có ngày kết thúc". Buổi khám mở bệnh án và tái khám vẫn được để trống `endDate` (dùng tới khi đóng bệnh án).

**FE cần sửa**
- Ô ngày kết thúc đơn thuốc thành bắt buộc khi buổi khám không mở bệnh án.

**Lý do**
- Không có bệnh án để đóng thì đơn để trống ngày kết thúc sẽ hiệu lực mãi.

### Thông báo đến hạn khám định kỳ

**Luật / hành vi API mới**
1. Thông báo mới cho mọi VET khi ngựa đến hạn khám định kỳ mà chưa có ngày hẹn khám: tiêu đề "Ngựa {tên} đến hạn khám định kỳ", nội dung "{tên} đến hạn khám định kỳ ngày dd/mm/yyyy. Vui lòng đặt lịch khám.". Loại `CARE_REMINDER`, mức `NORMAL`, gắn với ngựa. Mỗi hạn khám chỉ báo một lần.
2. Các nhắc lịch y tế chạy lúc 05:00 sáng mỗi ngày (trước là 07:00).

**FE cần sửa**
- Không đổi API. Bấm thông báo mở hồ sơ ngựa như các thông báo `CARE_REMINDER` đang có.

**Lý do**
- Bác sĩ cần được nhắc đặt lịch khám định kỳ trước giờ làm.

### Đổi vòng đời sang đúng trạng thái hiện tại là 409

**Luật / hành vi API mới**
1. `PATCH /horses/:horseId/lifecycle-status` gửi đúng trạng thái hiện tại (kể cả ghi nhận mất lần nữa): 409 `Ngựa <tên> đã ở trạng thái <trạng thái>` (trước trả 200, không ghi gì). Xem trước trả `blockedReason` cùng câu này.

**FE cần sửa**
- Ẩn lựa chọn trạng thái hiện tại; hiện `blockedReason` nếu có.

**Lý do**
- Trả 200 mà không làm gì khiến người dùng tưởng đã ghi nhận.

### Báo chủ cũ khi bán ngựa ra ngoài

**Luật / hành vi API mới**
1. `PATCH /horses/:horseId/lifecycle-status` sang `TRANSFERRED` (bán ra ngoài): chủ vừa kết thúc sở hữu nhận thông báo `HORSE_LIFECYCLE` (chỉ khi tài khoản còn hoạt động), `resource = null` vì chủ cũ không mở được hồ sơ nữa. Trước đây không báo chủ cũ.
2. Kích hoạt lại từ `TRANSFERRED`: chủ mới (`ownerId` gửi lên) nhận thông báo.

**FE cần sửa**
- Thông báo có `resource = null` thì không mở hồ sơ ngựa.

**Lý do**
- Chủ cũ cần biết ngựa của mình đã được ghi nhận bán ra ngoài.

### Groom phụ trách xem mọi sự cố của ngựa

**Luật / hành vi API mới**
1. `GET /incidents`, `GET /incidents/:id`: Groom đang phụ trách ngựa xem được mọi sự cố của ngựa đó, kể cả do Groom khác báo hộ. Ngựa chuyển cho Groom khác thì Groom cũ chỉ còn thấy sự cố mình báo.

**FE cần sửa**
- Không đổi API. Danh sách sự cố của Groom có thể có sự cố do người khác báo.

**Lý do**
- Groom phụ trách cần biết mọi sự cố của ngựa mình chăm, kể cả do Groom khác báo hộ.

## Ngày 17/10/2026

### Nhật ký: hệ thống chấm lại lượt tập

**Luật / hành vi API mới**
1. Đặt khóa, gỡ khóa huấn luyện hoặc đổi sức khỏe làm hệ thống chấm lại các lượt sắp tới của ngựa. Mỗi lượt đổi trạng thái hoặc lý do không đủ điều kiện ghi một dòng `GET /audit-logs`: `feature = TRAIN_RUN`, `entityType = SESSION_PARTICIPANT`, `action = UPDATE`, `actor = null`, lý do "Hệ thống chấm lại điều kiện tập sau khi đổi khóa huấn luyện hoặc sức khỏe"; `before`/`after` có `status`, `ineligibilityReason`.

**FE cần sửa**
- Không đổi API. Màn nhật ký hiện được dòng có `actor = null` (vd "Hệ thống").

**Lý do**
- Lượt tập tự đổi trạng thái phải truy được nguyên nhân.

### Khóa sửa buổi khi mở điểm danh

**Luật / hành vi API mới**
1. Sửa buổi (kéo đổi giờ, đổi môn, thời gian mục tiêu...) chỉ được khi buổi `SCHEDULED` và chưa tới giờ mở điểm danh (30 phút trước giờ bắt đầu). Các trường hợp khác: 409 `Chỉ sửa được buổi tập đã lên lịch, trước giờ mở điểm danh (30 phút trước giờ bắt đầu)`. (Thời gian mục tiêu sửa trên buổi từ 19/10, xem B10.)
2. Điểm danh, báo vắng, sẵn sàng, bắt đầu trên buổi đã hoàn thành hoặc đã hủy: câu 409 đổi thành `Buổi tập đã kết thúc hoặc đã hủy, không thao tác được`.

**FE cần sửa**
- Khóa kéo thả và nút sửa buổi từ 30 phút trước giờ bắt đầu.

**Lý do**
- Đổi buổi lúc Groom đã dắt ngựa ra điểm danh làm lệch lượt tập đang chạy.

### Chủ sở hữu và tạo ngựa

**Luật / hành vi API mới**
1. `POST /horses`: `ownerId` (UUID tài khoản HORSE_OWNER đang hoạt động) và `microchipId` (đúng 15 chữ số) **bắt buộc**. Thiếu, `null` hoặc sai định dạng: 400 gắn đúng ô. `PATCH /horses/:horseId` không cho xóa số chip: gửi `microchipId` là `null` hoặc chuỗi rỗng trả 400 ở ô đó (không gửi thì giữ nguyên, đổi sang số khác vẫn được).
2. Trùng số chip (tạo hoặc sửa): 409, câu báo nêu tên, tình trạng con đang giữ số chip và cách xử lý; `errors[0].conflictId` là id con đó.

   ```json
   {
     "code": 409,
     "message": "Số chip trùng với ngựa Winx (Đã chuyển nhượng). Dùng kích hoạt lại thay vì tạo mới",
     "errors": [{ "field": "microchipId", "message": "Số chip trùng với ngựa Winx (Đã chuyển nhượng). Dùng kích hoạt lại thay vì tạo mới", "conflictId": "uuid" }]
   }
   ```

   - Trùng hồ sơ đã xóa: "... (hồ sơ đã xóa). Khôi phục hồ sơ đó thay vì tạo mới". Các trường hợp khác (và khi sửa hồ sơ): "... Kiểm tra lại số chip".
3. Đổi vòng đời sang `TRANSFERRED` (bán ra ngoài): kết thúc giai đoạn sở hữu và bỏ trống chủ (`ownerId` thành `null`). ~~Chủ cũ không nhận thông báo~~ (đã thay ở 18/10, xem "Báo chủ cũ khi bán ngựa ra ngoài").
4. Kích hoạt lại từ `TRANSFERRED` (`PATCH /horses/:horseId/lifecycle-status`, `lifecycleStatus = ACTIVE`): body **bắt buộc** `ownerId` (HORSE_OWNER đang hoạt động), thiếu là 400; gửi `ownerId` ở mọi trường hợp khác là 400. Kích hoạt lại từ `RETIRED` giữ nguyên chủ. Sức khỏe khi kích hoạt lại: xem F1-4 ngày 20/10.
   - Preview: thêm `ownerRequired` (true khi phải chọn chủ). `ownerCleared` là tên chủ sẽ kết thúc sở hữu khi bán ra ngoài (null nếu giữ chủ).
5. Route mới cho chủ cũ, chỉ HORSE_OWNER:
   - `GET /past-horses`: các con mình từng sở hữu, đã kết thúc giai đoạn, không còn là chủ hiện tại, bỏ hồ sơ đã xóa. Mỗi dòng: `{ horseId, name, photoUrl, periods: [{ startedAt, endedAt }] }`, mới nhất trước.
   - `GET /past-horses/:horseId`: thêm `gender`, `dateOfBirth`, `color`, `ancestors` (phả hệ 2 đời, chỉ tên, `canOpen` luôn false). Không từng sở hữu hoặc đang là chủ hiện tại: 404.
   - Không trả chủ mới, khu, ô, sức khỏe, khóa tập. Các tab khác của hồ sơ ngựa vẫn chỉ cho chủ hiện tại.
6. `GET /reports/club/finance` có thêm `unowned`: phần của các ngày ngựa ở CLB mà không có chủ, cộng chi phí các buổi khám lúc ngựa không có chủ. Không có thì các số bằng 0.

   ```json
   "unowned": { "billedDays": 4, "dailyFee": 800000, "medicalCost": 300000, "surcharge": 80000, "total": 1180000 }
   ```

   - `billedDays`: tổng số ngày tính phí (mỗi ngựa mỗi ngày tính một). `ownerCharges` = tổng `owners` + `unowned`. `GET /reports/owner/costs` không đổi.
7. `PATCH /horses/:horseId` nhận `ownerId` để gán chủ cho ngựa đang không có chủ (vd sau khi khôi phục hồ sơ đã xóa). Chủ phải là HORSE_OWNER đang hoạt động. Gửi `null`: 400 ô `ownerId` "Không bỏ trống chủ sở hữu được, đổi chủ bằng chức năng chuyển nhượng nội bộ". Ngựa đã có chủ khác: 409 "Ngựa đã có chủ sở hữu, đổi chủ bằng chức năng chuyển nhượng nội bộ".

**FE cần sửa**
- Form tạo ngựa: chủ và số chip bắt buộc. Lỗi trùng chip hiện nút mở hồ sơ theo `conflictId`.
- Kích hoạt lại từ `TRANSFERRED`: hiện ô chọn chủ khi `ownerRequired = true`.
- Thêm màn "Ngựa từng sở hữu" cho OWNER; thêm khối `unowned` ở báo cáo tài chính CLB.

**Lý do**
- Ngựa phải có chủ và định danh rõ; bán ra ngoài thì chủ cũ không còn quyền xem hồ sơ hiện tại.

### Lịch chăm sóc y tế: giao theo vai trò

**Luật / hành vi API mới**
1. `POST /horses/:horseId/care-schedules` và `PATCH /care-schedules/:id` có thêm `assigneeType` (`GROOM` | `VET`), đi kèm `assignedTo`:

   | `assigneeType` | `assignedTo` | Nghĩa |
   |---|---|---|
   | bỏ trống / `null` | bỏ trống | Chưa giao ai |
   | `GROOM` | bỏ trống | Groom đang phụ trách ngựa; đổi Groom thì lịch tự theo Groom mới |
   | `GROOM` | UUID Groom | Đúng Groom đó, kể cả Groom không phụ trách ngựa |
   | `VET` | UUID bác sĩ (bắt buộc) | Đúng bác sĩ đó |

   - Gửi `assignedTo` mà không có `assigneeType`, hoặc `VET` không kèm người: 400 ô `assignedTo`. Người không đúng vai trò hoặc không hoạt động: 400.
   - Sửa lịch: muốn đổi cách giao thì gửi `assigneeType` (kèm `assignedTo` nếu chọn người). Tiêm phòng, Tẩy giun không giao Groom được (từ 18/10).
2. Response lịch chăm sóc có thêm `assigneeType`. `assignedTo = null` kèm `assigneeType = GROOM` nghĩa là "Groom phụ trách".
3. `GET /grooms/me/today` có thêm `otherCareSchedules`: lịch giao đích danh cho Groom ở ngựa Groom không phụ trách, mỗi dòng có `horseId`, `horseName`. `careSchedules` trong từng ngựa gồm cả lịch giao "Groom phụ trách".
4. `assignedTo` trong khối lịch chăm sóc của `GET /medical/dashboard` là người làm hiện tại (đã tra Groom phụ trách), `null` nếu chưa có ai.
5. Khóa tài khoản hoặc đổi vai trò người còn lịch chưa làm được giao đích danh: 409 `Người này còn N lịch chăm sóc được giao đích danh chưa làm, cần nhờ bác sĩ giao lại trước khi khóa tài khoản` (đổi vai trò thì kết thúc bằng "trước khi đổi vai trò").

**FE cần sửa**
- Form lịch chăm sóc: chọn cách giao (`assigneeType`) rồi mới chọn người; hiện "Groom phụ trách" khi `assignedTo = null` và `assigneeType = GROOM`.
- Màn Hôm nay của Groom: thêm khối `otherCareSchedules`.

**Lý do**
- Lịch giao "Groom phụ trách" tự theo khi ngựa đổi Groom, không phải giao lại tay.

### Checklist hằng ngày: tự thử lại và nút sinh lại

**Luật / hành vi API mới**
1. Route mới `POST /daily-checklists/regenerate-today`, chỉ CM, không có body. Sinh checklist hôm nay cho các ngựa có Groom mà còn thiếu; checklist đã có giữ nguyên. Trả 200:

   ```json
   { "date": "2026-10-17", "generated": 1, "failures": [{ "horseId": "…", "horseName": "Gió", "message": "…" }] }
   ```

   - `failures` rỗng là đủ. Vai trò khác: 403.
2. Thông báo mới cho CM, `category = DAILY_CHECKLIST`, `resource = null`:
   - Lỗi kéo dài (mức `HIGH`), tối đa một lần mỗi ngày: tiêu đề "Lỗi sinh checklist hôm nay", nội dung "Chưa có checklist hôm nay cho Winx, Gió. Hệ thống đang thử lại."
   - Đã đủ lại (mức `NORMAL`), chỉ khi trước đó đã báo lỗi: tiêu đề "Checklist hôm nay đã đủ", nội dung "Đã có đủ checklist hôm nay."

**FE cần sửa**
- Thêm nút "Sinh lại checklist hôm nay" cho CM (có thể gắn vào thông báo lỗi), hiện `failures`.

**Lý do**
- Job sinh checklist lỗi thì Groom không có việc trong ngày; CM cần biết và tự sinh lại được.

### Miễn việc chung cho từng ngựa

**Luật / hành vi API mới**
1. `POST /horses/:horseId/care-tasks` nhận thêm `mode` (`EXTRA` | `EXEMPT`, mặc định `EXTRA`).
   - `EXEMPT` miễn một loại việc đang "áp mọi ngựa" trong khoảng ngày. `note` là lý do, bắt buộc: thiếu trả 400 ô `note`.
   - Miễn loại việc không áp mọi ngựa: 409.
2. Response việc riêng (`GET /horses/:horseId/care-tasks` và POST ở trên) có thêm `mode`.
3. Miễn bắt đầu hôm nay: dòng việc đó biến khỏi checklist hôm nay nếu chưa tick. Gỡ dòng miễn (`DELETE /horse-care-tasks/:id`): việc có lại ngay trong checklist hôm nay, Groom nhận thông báo "Có việc mới hôm nay".
4. `PATCH /care-task-types/:id` đổi `appliesToAll` khi còn ngựa được gắn thêm hoặc được miễn loại đó chưa hết hạn: 409.

**FE cần sửa**
- Form việc riêng thêm lựa chọn Miễn; hiện dòng `EXEMPT` là "Miễn: <tên việc>".

**Lý do**
- Ngựa ốm cần bỏ một việc chung vài ngày (vd không tắm khi sốt).

### Ai được báo sự cố

**Luật / hành vi API mới**
1. `POST /incidents`: mọi Groom đang hoạt động báo được cho ngựa đang ở CLB, không cần đang phụ trách con đó (trước đây 403).
2. Ngựa đã chuyển nhượng hoặc đã mất vẫn 409, kể cả với Groom cũ của ngựa.
3. Groom báo hộ: Groom đang phụ trách ngựa nhận thông báo "Sự cố tại chuồng" như HT của khu. Groom báo hộ xem được sự cố mình báo. Groom đang phụ trách xem sự cố của ngựa: xem "Groom phụ trách xem mọi sự cố của ngựa" ngày 18/10.
4. HT, CM, VET vẫn không gọi được route này (403); họ gửi yêu cầu khám qua `POST /horses/:horseId/exam-requests`.

**FE cần sửa**
- Bỏ giới hạn "chỉ chọn ngựa mình phụ trách" ở màn báo sự cố.

**Lý do**
- Groom nào thấy ngựa có chuyện cũng phải báo được ngay.

### Hủy lần xuất kho ghi nhầm

**Luật / hành vi API mới**
1. Route mới `POST /supplies/usages/:usageId/cancel`, body `{ "reason": "Ghi nhầm số lượng" }` (bắt buộc, tối đa 500 ký tự). Trả 200 kèm vật tư sau khi cộng trả tồn.
   - Người xuất tự hủy trong 24 giờ, CM hủy bất kỳ lúc nào; còn lại 403. Lần xuất đã hủy: 409. Mã không có: 404.
2. `GET /supplies/items/:id/movements` mỗi dòng có thêm:
   - `usageId`: mã lần xuất, chung cho các dòng `USAGE` của một lần xuất và dòng `USAGE_REVERSAL` hủy nó. Dòng xuất cũ có `usageId = null`, không hủy được.
   - `cancelled`: `true` ở dòng `USAGE` của lần xuất đã hủy.
   - Loại dòng mới `type = USAGE_REVERSAL` (số dương, ghi chú là lý do hủy).
3. `GET /reports/club/finance`: "đã dùng" không tính lần xuất đã hủy, kể cả ở tháng đã xem trước đó.

**FE cần sửa**
- Nút "Hủy lần xuất" ở dòng `USAGE` có `usageId`, chưa `cancelled`, và (với người không phải CM) do chính người dùng xuất trong 24 giờ.
- Gạch dòng `cancelled`; thêm nhãn cho `USAGE_REVERSAL`.

**Lý do**
- Xuất nhầm số lượng cần sửa mà vẫn giữ dấu vết trong sổ kho.

### Thông báo mới cho Groom và người gửi yêu cầu khám

**Luật / hành vi API mới**
1. Groom đang phụ trách ngựa nhận thêm (cùng nội dung với HT và chủ):
   - Đặt khóa huấn luyện (HIGH) và gỡ khóa (NORMAL), `category = TRAINING_LOCK`.
   - Đổi trạng thái sức khỏe, mọi chiều, `category = HEALTH_STATUS`: Chấn thương, Cách ly (HIGH); Cần theo dõi, về Đủ điều kiện (NORMAL).
2. Người gửi yêu cầu khám (Groom qua sự cố, HT, CM) nhận kết quả, `category = EXAM_REQUEST`, mức NORMAL, `resource` là ngựa:
   - Khám xong: "Ngựa X đã được bác sĩ khám".
   - Bỏ qua: "Yêu cầu khám ngựa X được bỏ qua", nội dung kèm lý do.
   - Yêu cầu do hệ thống tự sinh (cảnh báo sốt, sụt cân) hoặc do chính bác sĩ xử lý gửi thì không có thông báo này.
3. Ca Khẩn vẫn chỉ báo một lần, không nhắc lại.

**FE cần sửa**
- Không đổi API. Hiện như các thông báo đang có (inbox, socket, push).

**Lý do**
- Groom là người trực tiếp với ngựa; người gửi yêu cầu khám cần biết kết quả.

### Bảng điều khiển y tế: lọc "Lịch của tôi"

**Luật / hành vi API mới**
1. `GET /medical/dashboard` nhận thêm `careAssignee=me` (tùy chọn): khối `careSchedules` chỉ còn lịch có người làm hiện tại là người gọi. Các khối khác không đổi.
2. Mỗi dòng `careSchedules` có thêm `assignedToName`: họ tên người làm hiện tại, `null` nếu chưa có ai.
3. Nhắc lịch chăm sóc không đổi: thông báo đẩy đúng ngày đến hạn một lần.

**FE cần sửa**
- Thêm bộ lọc "Lịch của tôi" và cột người làm (`assignedToName`).

**Lý do**
- Bác sĩ cần lọc nhanh việc của mình trong danh sách lịch chung.

### Báo Groom khi buổi tập bị hủy

**Luật / hành vi API mới**
1. HT hủy một buổi (`POST /training-sessions/:sessionId/cancel`): người dắt từng lượt vừa bị hủy nhận thông báo `category = TRAINING_SESSION` (loại mới), mức HIGH, `resource = null`.
   - Mỗi Groom một tin liệt kê ngựa của mình, vd "Buổi tập Sức bền sáng lúc 06:00 ngày 21/11/2026 đã hủy: Mưa lớn. Không dắt Winx, Gió ra sân."
   - Lượt chưa có người dắt thì Groom đang phụ trách ngựa nhận.
2. Hủy cả lớp không gửi thông báo này.

**FE cần sửa**
- Thêm biểu tượng cho `category = TRAINING_SESSION`.

**Lý do**
- Groom cần biết để không dắt ngựa ra sân.

## Ngày 16/10/2026

### Lớp học: xếp lịch kiểu lịch tuần, bỏ nháp

**Luật / hành vi API mới**
1. **Môn học** có thêm `durationMinutes` (phút, 15–480): bắt buộc khi tạo, tùy chọn khi sửa; response luôn có.
2. **Giáo án** bỏ `weekdays`, thay bằng số buổi tối thiểu mỗi tuần:
   - Body `POST`/`PUT /training-plans`: `phases: [{ weeks, subjects: [{ subjectId, minSessionsPerWeek }] }]`, `minSessionsPerWeek` 1–14. Gửi `weekdays` là 400.
   - Response giáo án và từng giai đoạn có thêm `minTotalMinutes` = số tuần × tổng (số buổi tối thiểu × thời lượng môn).
3. **Tạo lớp** chỉ cần `code`, `name`, `planId`, `startDate`. Bỏ `sessions` trong body; lớp tạo ra chưa có buổi nào. (`startDate` không được ở quá khứ từ 19/10, xem B7.)
   - Lớp chép giáo án lúc tạo. Sau đó sửa giáo án không làm đổi lớp.
   - Lớp tạo ra là `ACTIVE` luôn. Bỏ trạng thái `DRAFT` của lớp và buổi.
   - `PATCH /classes/:classId/status` chỉ nhận `COMPLETED` hoặc `CANCELLED` (gửi `ACTIVE` là 400).
4. **Bỏ route**: `POST /classes/schedule-preview`, `POST /classes/:classId/sessions/publish`, `POST /training-sessions/:sessionId/publish`. Buổi lưu xong là `SCHEDULED` và có hiệu lực ngay.
5. **Route mới**:
   - `GET /classes/:classId/plan`: giáo án của lớp, có khoảng ngày của từng giai đoạn.

     ```json
     {
       "classId": "uuid", "planId": "uuid", "minTotalMinutes": 360,
       "phases": [
         { "position": 1, "weeks": 2, "startDate": "2027-01-04", "endDate": "2027-01-17", "minTotalMinutes": 360,
           "subjects": [{ "subject": { "id": "uuid", "name": "Sức bền", "durationMinutes": 60, "...": "giống response môn học" }, "minSessionsPerWeek": 3 }] }
       ]
     }
     ```

   - `GET /classes/:classId/progress`: tiến độ xếp lịch theo tuần. Thiếu hay vượt đều không bị chặn.

     ```json
     {
       "classId": "uuid", "minTotalMinutes": 360, "scheduledMinutes": 120,
       "weeks": [
         { "week": 1, "phasePosition": 1, "startDate": "2027-01-04", "endDate": "2027-01-10",
           "subjects": [{ "subjectId": "uuid", "subjectName": "Sức bền", "minSessions": 3, "scheduledSessions": 2 }] }
       ]
     }
     ```

   - `POST /classes/:classId/sessions/bulk`: thêm nhiều buổi một lần. Body `{ "sessions": [ ...giống body thêm một buổi ] }`, 1–100 buổi. Một buổi lỗi thì không lưu buổi nào. Câu báo có tiền tố `Buổi N: ` (N đếm từ 1). Ô lỗi là `sessions.{i}.{ô}` (vd `sessions.0.subjectId`); lỗi không gắn ô thì là `sessions.{i}` (i đếm từ 0).
   - `GET /classes/:classId/enrollable-horses`: ngựa ghi danh được vào lớp lúc này, trả `[{ horseId, horseName, horsePhotoUrl }]`. Đã tự loại ngựa đã ghi danh, ngựa trùng giờ và ngựa vượt giới hạn tập trong ngày.
6. Thêm hoặc sửa buổi: môn của buổi phải có trong giai đoạn của lớp chứa ngày đó. Sai thì 409 `Môn {tên} không có trong giai đoạn {n} của lớp`.

**FE cần sửa**
- Form môn thêm thời lượng; form giáo án thay thứ trong tuần bằng số buổi tối thiểu mỗi tuần.
- Tạo lớp không gửi buổi; xếp buổi trên lịch tuần, dùng `/plan` và `/progress` để tô thiếu/đủ, nút "lặp lại hằng tuần" gọi `/sessions/bulk`.
- Bỏ trạng thái nháp và các nút xuất bản.

**Lý do**
- Theo góp ý demo: HT xếp lịch trực tiếp trên lịch tuần thay vì sinh lịch từ thứ trong tuần rồi xuất bản.

### Cường độ chỉ còn Nhẹ và Nặng, có giới hạn tập trong ngày

**Luật / hành vi API mới**
1. Bỏ `MODERATE`. `intensity` chỉ còn `LIGHT` hoặc `HEAVY`, ở môn, buổi, tab huấn luyện của ngựa và báo cáo. Dữ liệu cũ `MODERATE` đã chuyển thành `HEAVY`. `GET /horses/:id/workload` và dashboard: object đếm theo cường độ chỉ còn `LIGHT`, `HEAVY`.
2. Ngựa Cần theo dõi chỉ tập buổi Nhẹ. Ngựa bị khóa huấn luyện không tập mức nào.
3. Mỗi ngựa: tối đa 2 buổi một ngày (lịch CLB), tối đa 1 buổi Nặng một ngày, hai buổi bất kỳ cách nhau ít nhất 3 giờ. Xét mọi lớp của ngựa.
4. Kiểm khi thêm buổi, sửa buổi và ghi danh. Vi phạm là 409, ví dụ:
   - Ngựa vướng lịch ở lớp khác: `Vượt giới hạn tập trong ngày của ngựa: Winx đã có buổi Nặng trong ngày (lớp K2, 08:00 ngày 05/01/2027)`
   - Buổi vướng chính các buổi của lớp này: `Buổi vượt giới hạn tập trong ngày của lớp: đã đủ 2 buổi trong ngày (lớp K1, 14:00 ngày 05/01/2027)`
   - Ba cách vượt: `đã có buổi Nặng trong ngày`, `đã đủ 2 buổi trong ngày`, `chưa nghỉ đủ 3 giờ so với buổi khác`.

**FE cần sửa**
- Bỏ `MODERATE` khỏi mọi lựa chọn, nhãn và biểu đồ. Hiện các câu 409 giới hạn tập trong ngày.

**Lý do**
- Theo góp ý demo: tránh ngựa bị tập quá sức trong một ngày.

### Lượt tập bị treo khi ngựa đổi vòng đời

**Luật / hành vi API mới**
1. Lượt `ONGOING` ở buổi đã quá giờ kết thúc 30 phút: hệ thống tự chuyển `COMPLETED`, lý do `Hệ thống tự hoàn thành`.
2. Ngựa được ghi nhận đã mất khi đang tập: lượt chuyển `CANCELLED`, lý do `Ngựa đã mất`.
3. Giải nghệ hoặc chuyển nhượng khi ngựa còn lượt đang tập: 409 `Ngựa đang tập, chờ hoàn thành lượt tập rồi mới giải nghệ hoặc chuyển nhượng`.

**FE cần sửa**
- Lượt có thể đổi trạng thái không do người dùng: tải lại thay vì giữ cache. Hiện câu 409 ở màn đổi vòng đời.

**Lý do**
- HT quên bấm hoàn thành thì lượt treo mãi ở Đang tập.

### Phụ phí chăm sóc riêng (thay cho "gói chăm sóc")

**Luật / hành vi API mới**
1. Không có gói. Chi phí của chủ = phí ngày chung + phụ phí riêng từng ngựa + chi phí y tế.
2. Route mới:

   | Method | Path | Ai gọi | Ghi chú |
   |---|---|---|---|
   | GET | `/horses/:horseId/surcharges` | CM, OWNER (ngựa của mình), HT (ngựa trong khu mình) | GROOM không xem được |
   | POST | `/horses/:horseId/surcharges` | CM | Body `{ description (≤500 ký tự), dailyAmount (VND/ngày, > 0), startDate, endDate }` |
   | POST | `/horse-surcharges/:id/apply` | HT khu hiện tại của ngựa | Bấm "Đã áp dụng", mỗi khoản một lần (lần hai 409) |
   | POST | `/horse-surcharges/:id/end` | CM | Kết thúc sớm, tính tới hết hôm nay |
   | DELETE | `/horse-surcharges/:id` | CM | Chỉ khi chưa tới ngày bắt đầu (409 nếu đã bắt đầu) |
   | GET | `/horse-surcharges/unapplied` | CM | Khoản HT chưa xác nhận, kèm `horseName`, `barnName`, `headTrainerName` (`null` là chưa có khu hoặc chưa có HT) |

   Response một khoản: `{ id, horseId, description, dailyAmount, startDate, endDate, createdBy, createdAt, appliedBy, appliedByName, appliedAt }`. Chưa xác nhận thì 3 trường `applied*` là `null`.
3. Ghi phụ phí xong, HT khu của ngựa và chủ ngựa nhận thông báo loại mới `SURCHARGE`.
4. Báo cáo có thêm số `surcharge`, đã cộng vào `total`: `GET /reports/owner/costs` (cả tổng và từng ngựa), `GET /reports/club/finance` (theo từng chủ).

**FE cần sửa**
- Thêm màn phụ phí của ngựa, nút "Đã áp dụng" cho HT, danh sách chưa xác nhận cho CM; hiện `surcharge` ở báo cáo.
- Báo cáo "định kỳ": cho chọn khoảng ngày (vd từng tháng) rồi gọi hai route báo cáo trên với `from`, `to`. Hệ thống không tự gửi báo cáo theo lịch.

**Lý do**
- Theo góp ý demo: chăm sóc riêng tính bằng phụ phí ghi chữ cho từng ngựa thay vì gói cố định.

### Chủ ngựa nhận thêm thông báo

**Luật / hành vi API mới**

Hộp thông báo của OWNER có thêm các loại sau, không có route mới:

1. Đặt và gỡ khóa huấn luyện (`TRAINING_LOCK`).
2. Ngựa chuyển sang Cần theo dõi, hoặc về Đủ điều kiện (`HEALTH_STATUS`).
3. Cảnh báo sốt, sụt cân (`MEASUREMENT_ALERT`).
4. Chỉ số tập vượt ngưỡng nguy hiểm (`PERFORMANCE_ALERT`, mức HIGH).
5. Giải nghệ, chuyển nhượng, kích hoạt lại (`HORSE_LIFECYCLE`). Người nhận khi bán ra ngoài và khi kích hoạt lại từ chuyển nhượng: xem "Báo chủ cũ khi bán ngựa ra ngoài" ngày 18/10.
6. Phụ phí mới (`SURCHARGE`).

**FE cần sửa**
- Thêm biểu tượng cho các `category` mới; thông báo có `resource = null` thì không mở hồ sơ.

**Lý do**
- Theo góp ý demo: chủ cần biết các thay đổi quan trọng về ngựa của mình.

### Nhật ký đăng nhập

**Luật / hành vi API mới**
1. `GET /audit-logs` có thêm hai `action`: `LOGIN_FAILED`, `PASSWORD_CHANGE`, kèm `feature` mới `AUTH`. `LOGIN` và `LOGOUT` được ghi thật. Đăng nhập sai chỉ ghi khi email có tài khoản; dòng đó có `actor = null` và `entityId` là tài khoản bị thử.
2. Keycloak bật chống dò mật khẩu: sai 5 lần liên tiếp thì tài khoản bị khóa tạm (khóa thêm 60 giây mỗi lần sai, tối đa 15 phút), sau đó tự mở. Trong lúc bị khóa, `POST /auth/login` vẫn trả 401.

**FE cần sửa**
- Thêm nhãn cho `LOGIN_FAILED`, `PASSWORD_CHANGE`, `AUTH` ở bộ lọc nhật ký; hiện dòng `actor = null`.

**Lý do**
- Theo góp ý demo: cần truy vết đăng nhập.

### Chấn thương bắt buộc tọa độ 3D

**Luật / hành vi API mới**
1. ~~`injuries[].position` bắt buộc trong body buổi khám~~ (đã thay ở 18/10, xem "Chấn thương theo từng vết"): body không còn `injuries`, gửi lên là 400.
2. Hiện hành: vết mới (`newInjuries[]`) bắt buộc `position` `{ x, y, z }` (số); cập nhật vết cũ (`injuryUpdates[]`) không gửi `position`.

**FE cần sửa**
- Theo mục 18/10.

**Lý do**
- Theo góp ý demo: vị trí chấn thương hiện trên mô hình 3D.

### Không đổi API, chỉ cần biết

**Luật / hành vi API mới**
1. Ngựa cần giáo án riêng: HT tạo một lớp riêng, chỉ ghi danh con ngựa đó.
2. Việc trong checklist không có giờ phải làm, chỉ cần xong trong ngày.
3. Ảnh khi báo sự cố là tùy chọn, tối đa một ảnh.

**FE cần sửa**
- Không.

**Lý do**
- Trả lời các ý góp ý demo không cần đổi API.
