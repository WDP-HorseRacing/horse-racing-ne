# Flow 2 — Lập và thực hiện giáo án huấn luyện

> Cập nhật: 17/10/2026

## I. Đề bài liên quan

**HEAD TRAINER**

- Lập giáo án huấn luyện chi tiết (cự ly, khối lượng, mặt sân) theo từng giai đoạn cho từng con ngựa.
- Phân công lịch tập luyện hằng ngày cho đội ngũ chăm sóc và quản lý lượt chạy thử.
- Xem cảnh báo vượt ngưỡng thể lực hoặc nguy cơ chấn thương dựa trên dữ liệu nhịp tim/vận tốc realtime.
- Đánh giá phong độ, ghi nhận chỉ số buổi tập và đưa ra nhận xét chuyên môn sau mỗi buổi tập.

**HORSE OWNER**: xem lịch trình tập luyện và nhận xét của Head Trainer.

**CLUB MANAGER**: quản lý danh mục, xem báo cáo hiệu suất huấn luyện.

**Cách hiểu đề bài**

- "Giáo án cho từng con ngựa": giáo án gắn với lớp, mỗi con ngựa ghi danh vào lớp có giáo án hợp với nó. Ngựa cần bài khác thì vào lớp khác.
- "Khối lượng": thể hiện bằng cường độ của môn (Nhẹ = buổi phụ / Nặng = buổi chính), cùng thời lượng một buổi của môn và cự ly dự kiến.

## II. Mô hình

```
GIÁO ÁN (mẫu)      của HT, dùng lại cho nhiều lớp
 └─ GIAI ĐOẠN      theo thứ tự, mỗi giai đoạn N tuần
     └─ MÔN HỌC    nhiều môn, mỗi môn có số buổi tối thiểu mỗi tuần
LỚP HỌC            HT phụ trách, ngựa ghi danh, ngày bắt đầu – kết thúc
 ├─ GIÁO ÁN CỦA LỚP  bản chép giáo án lúc tạo lớp, kèm khoảng ngày từng giai đoạn
 └─ BUỔI TẬP       HT tự xếp sau khi tạo lớp
     └─ LƯỢT TẬP   mỗi ngựa trong lớp một lượt mỗi buổi
         ├─ kết quả chạy thử, đánh giá của HT
         └─ điểm đo nhịp tim/tốc độ (MongoDB)
```

| Khái niệm | Bảng | Ai tạo, sửa | Ghi chú |
|---|---|---|---|
| Môn học | `training_subjects` | Club Manager | Danh mục dùng chung CLB. Mỗi môn là một bài cố định: loại buổi (thường / chạy thử), cường độ, cự ly dự kiến, thời lượng một buổi (15–480 phút), mặt sân, thời gian mục tiêu (chỉ môn chạy thử). |
| Giáo án | `training_plans`, `training_plan_phases`, `training_plan_subjects` | Head Trainer sở hữu | Chia giai đoạn theo thứ tự, mỗi giai đoạn bao nhiêu tuần; trong giai đoạn mỗi môn có số buổi tối thiểu mỗi tuần. Dùng lại cho các lớp của chính Head Trainer đó. |
| Lớp học | `training_classes` | Head Trainer | Tạo từ một giáo án của Head Trainer phụ trách lớp. Ngày kết thúc tự tính. |
| Giáo án của lớp | `training_class_phases`, `training_class_phase_subjects` | Hệ thống chép lúc tạo lớp | Sửa giáo án mẫu sau đó không đổi giáo án của lớp. Chưa sửa riêng được. |
| Buổi tập | `training_sessions` | Head Trainer | Thuộc lớp, gắn môn học. Lưu bản chép cường độ, cự ly, mặt sân của môn lúc tạo. |
| Lượt tập | `session_participants` | Hệ thống tạo khi thêm, sửa buổi hoặc ghi danh | Điểm danh, sẵn sàng, bắt đầu, hoàn thành theo từng ngựa. |

Ngựa cần bài khác nhau thì ghi danh vào các lớp khác nhau; trong một buổi, mọi ngựa cùng một bài.

## III. Luật nghiệp vụ

### 1. Môn học

1. Tên môn duy nhất trong CLB.
2. Môn chạy thử phải có cự ly lớn hơn 0. Môn thường không có thời gian mục tiêu.
3. Môn đang nằm trong giáo án, giáo án của lớp hoặc buổi tập thì không xóa được.
4. Sửa môn không làm đổi các buổi tập đã tạo.

### 2. Giáo án

1. Giáo án thuộc Head Trainer tạo ra. Head Trainer khác không xem, không dùng được. Club Manager xem được mọi giáo án nhưng không tạo, không sửa.
2. Giáo án có 1–52 giai đoạn, tổng không quá 104 tuần. Mỗi giai đoạn 1–52 tuần và 1–7 môn; mỗi môn có số buổi tối thiểu mỗi tuần 1–14. Không ghi thứ hay giờ; Head Trainer xếp buổi khi vào lớp. Tuần bắt đầu của mỗi giai đoạn tính theo thứ tự (giai đoạn 1 tuần 1–4 thì giai đoạn 2 bắt đầu tuần 5).
3. Trong một giai đoạn, một môn chỉ có một dòng. Vi phạm thì báo 400 đúng ô lỗi: "Giai đoạn 2: môn học bị lặp".
4. Thời lượng tối thiểu (`minTotalMinutes`, phút) của giai đoạn = số tuần × tổng (số buổi tối thiểu × thời lượng môn); của giáo án là tổng các giai đoạn.
5. Sửa giáo án là thay toàn bộ các giai đoạn. Lớp đã tạo từ giáo án giữ nguyên giáo án của lớp.
6. Giáo án đã có lớp dùng thì không xóa được.

### 3. Tạo lớp

1. Chỉ Head Trainer tạo lớp, và lớp luôn do chính Head Trainer đó phụ trách.
   - Ngựa cần giáo án riêng (ví dụ ngựa đang hồi phục): Head Trainer tạo một lớp riêng chỉ ghi danh con ngựa đó. Không có giáo án gắn thẳng vào ngựa.
2. Tạo lớp chỉ cần giáo án và ngày bắt đầu. Lớp chép các giai đoạn và môn của giáo án (`GET /classes/:classId/plan`, kèm khoảng ngày và thời lượng tối thiểu của từng giai đoạn). Không tạo buổi tập nào; Head Trainer thêm buổi sau.
3. Ngày kết thúc lớp = ngày bắt đầu + tổng số tuần của giáo án − 1 ngày. Giai đoạn nối tiếp nhau từ ngày bắt đầu, mỗi tuần 7 ngày.
   - Tiến độ xếp lịch (`GET /classes/:classId/progress`): từng tuần của lớp (tuần thứ n gồm 7 ngày từ ngày bắt đầu + (n − 1) × 7), mỗi môn của giai đoạn đã xếp bao nhiêu buổi chưa hủy so với số buổi tối thiểu; buổi tính vào tuần theo ngày bắt đầu (lịch CLB). Kèm thời lượng tối thiểu của lớp và tổng thời lượng các buổi chưa hủy đã xếp (phút). Thiếu hay vượt chỉ để hiển thị, không chặn.
4. Mỗi buổi phải nằm trong thời gian của lớp, so theo ngày lịch CLB (giờ Việt Nam).
5. Loại buổi lấy theo môn của buổi. Thêm buổi vào lớp bắt buộc có môn; loại buổi gửi kèm (nếu có) phải khớp môn. Khi thêm buổi chạy thử vào lớp, cấu hình chạy thử được tạo ngay trong cùng request (`targetTimeMs` không bắt buộc, `null` là không có mục tiêu).
6. Lớp tạo ra là Đang chạy (không có nháp, không có bước kích hoạt). Lớp chỉ đổi sang Hoàn thành hoặc Đã hủy (`PATCH /classes/:classId/status`, gửi trạng thái khác là 400).
7. Đổi ngày bắt đầu của lớp thì ngày kết thúc tự tính lại theo giáo án của lớp; buổi nằm ngoài khoảng mới thì chặn.
8. Lớp không đổi được giáo án hay Head Trainer sau khi tạo. Đổi Head Trainer chỉ qua bàn giao (mục 7).

### 4. Buổi tập và chạy thử

1. Thêm, sửa buổi khi lớp đang chạy. Lớp đã hoàn thành hoặc đã hủy thì không.
2. Buổi không có nháp: lưu là Đã lên lịch và có hiệu lực ngay. Mỗi ngựa đang học lớp vào giờ bắt đầu có một lượt tập theo điều kiện tập hiện tại (mục 5).
3. Sửa buổi (kéo đổi giờ, đổi môn, cường độ, cự ly...) và sửa cấu hình chạy thử: chỉ khi buổi Đã lên lịch và chưa tới giờ mở điểm danh (30 phút trước giờ bắt đầu), không thì 409. Từ lúc mở điểm danh, muốn đổi thì hủy buổi rồi thêm buổi mới. Sửa xong, lượt tập được đồng bộ lại: ngựa học lớp vào giờ mới mà chưa có lượt thì có lượt (lượt đã hủy được dùng lại); lượt Chờ điểm danh, Hủy do khóa, Không đủ điều kiện được chấm lại theo cường độ mới và gắn Groom phụ trách lúc bắt đầu; ngựa không còn học lớp vào giờ mới thì lượt bị hủy, lý do "Ngựa không học lớp vào giờ mới của buổi".
4. Môn của buổi phải có trong giai đoạn của lớp chứa ngày bắt đầu của buổi (lịch CLB), không thì 409 "Môn {tên} không có trong giai đoạn {n} của lớp". Kiểm khi thêm buổi, và khi sửa buổi có đổi môn hoặc đổi giờ bắt đầu. Xếp nhiều hơn số buổi tối thiểu vẫn được.
5. Thêm nhiều buổi một lần (`POST /classes/:classId/sessions/bulk`, 1–100 buổi, dùng cho nút lặp lại trên lịch): lưu theo thứ tự giờ bắt đầu, mỗi buổi áp đúng luật của thêm từng buổi, kể cả trùng giờ với các buổi vừa thêm trước nó. Một buổi lỗi thì không lưu buổi nào; câu báo có tiền tố "Buổi {thứ tự trong body}: " và ô lỗi `sessions.{chỉ số}`.
6. Xóa buổi trên lịch là hủy buổi (`POST /training-sessions/:sessionId/cancel`): buổi giữ lại ở trạng thái Đã hủy, lượt chưa tập bị hủy. Người dắt từng lượt vừa bị hủy nhận thông báo (mức HIGH), mỗi Groom một tin liệt kê các ngựa của mình; lượt chưa có người dắt thì báo Groom đang phụ trách ngựa. Hủy cả lớp không gửi thông báo này.
7. Ghi danh ngựa vào lớp đang chạy: tạo lượt cho các buổi đã lên lịch trong tương lai.
8. Trùng giờ: mỗi buổi tính từ giờ bắt đầu tới trước giờ kết thúc; buổi này kết thúc đúng lúc buổi kia bắt đầu thì không trùng.
   1. Thêm buổi hoặc đổi giờ buổi trùng với buổi chưa hủy khác của cùng lớp: chặn 409, câu báo kèm giờ và ngày của buổi trùng.
   2. Một ngựa học được nhiều lớp nhưng không có hai buổi trùng giờ. Lịch của ngựa ở một lớp: các buổi Đã lên lịch, Đang diễn ra có giờ bắt đầu sau hiện tại và nằm trong một khoảng ghi danh chưa hủy `[ghi danh, rời lớp)` của ngựa ở lớp đó. Ngựa đã rời lớp thì các buổi sau lúc rời không còn trong lịch.
   3. Lượt giữ chỗ: Chờ điểm danh, Có mặt, Sẵn sàng, Đang tập, Hủy do khóa, Không đủ điều kiện (hai trạng thái sau còn có thể mở lại, mục 5 luật 6), ở buổi chưa hủy, chưa hoàn thành. Lượt giữ chỗ tính cả buổi đã tới giờ mà chưa đóng. Vì ngựa chỉ học lớp của Head Trainer phụ trách khu mình, trùng giờ xảy ra giữa các lớp của cùng một Head Trainer.
   4. Ghi danh: chặn 409 cả thao tác ("Ngựa {tên} đã có buổi tập trùng giờ ở lớp {mã lớp}") khi ngựa đang giữ chỗ ở lớp khác trùng giờ với một buổi đã lên lịch chưa tới giờ của lớp này, hoặc lịch của ngựa ở lớp này (tính từ lúc ghi danh) trùng giờ với lịch của ngựa ở lớp khác.
   4a. Danh sách ngựa ghi danh được (`GET /classes/:classId/enrollable-horses`, chỉ Head Trainer của lớp, lớp phải đang chạy, không thì 409): ngựa đang hoạt động thuộc khu người gọi phụ trách, bỏ ngựa đang ghi danh ở lớp và ngựa trùng giờ theo luật 4; sắp theo tên, kèm `horseName`, `horsePhotoUrl`. Không xét sĩ số. Ngựa trong danh sách vẫn có thể bị 409 nếu lịch đổi giữa lúc xem và lúc ghi danh.
   5. Thêm buổi hoặc đổi giờ buổi: kiểm sau luật 8.1. Xét mọi ngựa có khoảng ghi danh chưa hủy ở lớp chứa giờ bắt đầu của buổi. Buổi trùng giờ với lịch hoặc lượt giữ chỗ của các ngựa đó ở lớp khác thì chặn 409, câu báo liệt kê mọi ngựa trùng theo tên, mỗi ngựa kèm mã lớp và giờ bắt đầu của buổi trùng sớm nhất: "Trùng giờ với lịch của ngựa: Công Phá (lớp KD-01, 06:00 ngày 10/10/2026), Giả Nhân (lớp KD-03, 06:00 ngày 10/10/2026)". Sửa buổi mà không đổi giờ thì không kiểm.
   6. Giới hạn tập trong ngày của mỗi ngựa (xét lịch của ngựa ở mọi lớp, cùng định nghĩa lịch và lượt giữ chỗ như luật 2, 3): tối đa 2 buổi một ngày theo lịch CLB, trong đó tối đa 1 buổi Nặng; hai buổi bất kỳ cách nhau tối thiểu 3 giờ tính từ lúc kết thúc buổi trước tới lúc bắt đầu buổi sau, kể cả qua nửa đêm.
      - Thêm buổi, đổi giờ hoặc đổi cường độ: buổi phải đạt giới hạn so với các buổi chưa hủy khác của chính lớp (409 "Buổi vượt giới hạn tập trong ngày của lớp: …"), và so với lịch ở lớp khác của mọi ngựa đang học lớp vào giờ đó (409 "Vượt giới hạn tập trong ngày của ngựa: {tên} {cách vượt} (lớp {mã}, {giờ})", liệt kê mọi ngựa vướng, sắp theo tên). Cách vượt: "chưa nghỉ đủ 3 giờ so với buổi khác", "đã đủ 2 buổi trong ngày", "đã có buổi Nặng trong ngày".
      - Ghi danh: mỗi buổi trong lịch của ngựa ở lớp này phải đạt giới hạn so với lịch ở lớp khác của ngựa, không thì 409 cả thao tác. Danh sách ngựa ghi danh được (4a) tự bỏ ngựa vướng.
7. Video chạy thử: Head Trainer xin tải lên (`POST /media/upload-requests`, `purpose = TRIAL_VIDEO`; MP4, WebM hoặc QuickTime, tối đa 200 MB) rồi gửi `videoMediaId` khi ghi kết quả; video phải do chính người ghi tải lên và đã có trên storage. Kết quả chạy thử trả `videoUrl` (link xem có hạn, null nếu không có video) ở `GET /session-participants/:id/trial-results` và `GET /horses/:horseId/training/sessions`, nên chủ ngựa xem được.
   1. Head Trainer phụ trách lớp gắn, đổi hoặc gỡ (`videoMediaId = null`) video của một lần chạy thử bằng `PATCH /session-participants/:id/trial-results/:attemptNo`, không kiểm khu của ngựa. Làm được tới 7 ngày sau giờ kết thúc dự kiến của buổi; buổi đã hủy thì 409. Chỉ video thay đổi, các số đo giữ nguyên.
8. Danh sách lượt tập của buổi (`GET /training-sessions/:sessionId/participants`) kèm `horseName`, `horsePhotoUrl` (link có hạn, null nếu ngựa chưa có ảnh) và `assignedGroomName` (null nếu chưa giao Groom); danh sách ghi danh của lớp (`GET /classes/:classId/enrollments`) kèm `horseName`, `horsePhotoUrl`. Ngựa hoặc Groom đã xóa mềm vẫn hiện tên; các endpoint ghi giữ response cũ.

### 5. Ngựa có được tập buổi này không

Áp khi thêm hoặc sửa buổi, ghi danh, điểm danh, bắt đầu lượt, và khi chấm lại (luật 6):

1. Ngựa đang bị khóa huấn luyện: lượt thành Hủy do khóa (`CANCELLED_BY_LOCK`).
2. Ngựa không được tập (chấn thương, cách ly, giải nghệ...): lượt thành Không đủ điều kiện (`INELIGIBLE`).
3. Ngựa Cần theo dõi chỉ tập buổi Nhẹ: gặp buổi Nặng thì lượt thành Không đủ điều kiện, lý do `HEALTH_UNDER_OBSERVATION`. Thang cường độ theo tình trạng: Đủ điều kiện tập cả hai mức; Cần theo dõi chỉ Nhẹ; bị khóa huấn luyện không tập mức nào (khóa chặn mọi cường độ, bao luôn yêu cầu "ngăn xếp lịch bài tập nặng" của đề).
4. Điểm danh hoặc bắt đầu bị chặn thì vẫn lưu trạng thái trên rồi báo lỗi 409.
5. Bắt đầu lượt cần lớp đang chạy.
6. Chấm lại ngay khi bác sĩ đặt khóa, gỡ khóa, hoặc sức khỏe ngựa đổi (xấu đi hay tốt lên): mọi lượt Chờ điểm danh (`PLANNED`), Hủy do khóa, Không đủ điều kiện của ngựa đó ở buổi đã lên lịch chưa tới giờ bắt đầu được chấm lại theo luật 1–3; ổn hết thì về Chờ điểm danh và xóa lý do. Lượt đã điểm danh, sẵn sàng, đang tập, đã kết thúc, và buổi đã tới giờ giữ nguyên.
   - Mỗi lượt đổi trạng thái hoặc lý do khi chấm lại được ghi một dòng nhật ký (người thao tác là hệ thống, chức năng `TRAIN_RUN`, kèm trạng thái trước và sau). Nhận lặp event không ghi thêm.
7. Buổi chưa tới giờ bắt đầu không bao giờ tự đóng, kể cả khi mọi lượt đều bị hủy hoặc không đủ điều kiện (còn chờ chấm lại).
8. Buổi đã tới giờ: lượt mở cuối cùng xong hoặc vắng thì buổi đóng ngay. Buổi đã tới giờ mà không còn lượt mở thì hệ thống tự đóng trong vòng một phút: có lượt đã diễn ra (hoàn thành, vắng, bỏ qua) thì Hoàn thành, không thì Hủy với lý do "Không còn ngựa tham gia".
9. Khung giờ thao tác (ví dụ buổi 15:00–16:00): điểm danh và báo vắng từ 30 phút trước giờ bắt đầu (14:30); báo sẵn sàng và bắt đầu từ 15 phút trước (14:45); tất cả đóng lúc hết giờ buổi (16:00). Ngoài khung giờ trả 409 kèm giờ mở hoặc giờ đóng. Hoàn thành lượt đang tập không giới hạn giờ.
10. Buổi đã hết giờ mà còn lượt chưa tập: trong vòng một phút hệ thống chuyển lượt Chờ điểm danh thành Vắng (lý do "Hết giờ, chưa điểm danh"), lượt Có mặt hoặc Sẵn sàng thành Bỏ qua (`SKIPPED`); lượt Đang tập giữ nguyên. Sau đó buổi đóng theo luật 8.
   - Việc tự chuyển Vắng hoặc Bỏ qua này không ghi nhật ký: luật cố định, nhìn trạng thái và lý do trên lượt là biết.
11. Lượt Đang tập bị quên: buổi đã quá giờ kết thúc từ 30 phút trở lên thì trong vòng một phút hệ thống chuyển lượt Đang tập thành Hoàn thành, thời điểm hoàn thành = giờ kết thúc dự kiến của buổi, nhật ký ghi người thao tác trống, lý do "Hệ thống tự hoàn thành"; buổi đóng như thường.
12. Ngựa được ghi nhận đã mất khi đang tập: lượt Đang tập bị hủy, lý do "Ngựa đã mất", buổi đóng như thường. Giải nghệ hoặc chuyển nhượng khi ngựa đang tập: 409, chờ hoàn thành lượt tập trước.
11. Tab buổi tập của ngựa (`GET /horses/:horseId/training/sessions`): `when=upcoming` là lượt còn mở (Chờ điểm danh, Có mặt, Sẵn sàng, Đang tập) bất kể giờ, cùng lượt Không đủ điều kiện của buổi chưa tới giờ; `when=history` là lượt đã kết thúc, kể cả lượt chạy xong trước giờ lịch. Lượt hủy hoặc không đủ điều kiện của buổi chưa tới giờ không nằm ở tab nào.

### 6. Nhịp tim và tốc độ (dữ liệu giả lập)

1. Không có thiết bị đo thật; script `pnpm sim` đóng vai cảm biến, mỗi giây gửi một điểm đo.
2. Chỉ nhận điểm đo khi lượt đang tập (`ONGOING`). Điểm trùng cảm biến và thời điểm đo bị bỏ qua.
3. Ngưỡng mặc định CLB: nhịp tim cảnh báo 220 bpm, nguy hiểm 240 bpm, tốc độ tối đa 18 m/s. Chỉ Head Trainer của khu đặt ngưỡng riêng cho từng ngựa theo phiên bản có khoảng hiệu lực.
4. Mức cảnh báo mỗi điểm: vượt ngưỡng nguy hiểm là `CRITICAL`; vượt ngưỡng cảnh báo nhịp tim hoặc tốc độ tối đa là `WARNING`; còn lại `NORMAL`.
5. Head Trainer của lớp nhận điểm đo realtime qua socket, sự kiện `performance.metrics`.
6. Có điểm `CRITICAL`: thông báo KHẨN cho mọi bác sĩ và Head Trainer của lớp, mỗi lượt tập một lần; chủ ngựa nhận một thông báo riêng mức HIGH báo bác sĩ và Head Trainer đã được báo.
7. Lịch sử cảnh báo của ngựa (`GET /horses/:id/alerts`): mọi điểm đo `WARNING`/`CRITICAL` qua các buổi, mới nhất trước, lọc theo mức và khoảng ngày lịch CLB, phân trang, kèm tên buổi. Club Manager, bác sĩ và Head Trainer của khu chứa ngựa xem.
8. Khối lượng tập của ngựa (`GET /horses/:id/workload?from&to`, mặc định 7 ngày gần nhất theo lịch CLB): chỉ tính lượt đã hoàn thành có buổi trong khoảng ngày; trả số lượt, số lượt theo cường độ, tổng cự ly dự kiến, tổng thời lượng thực (bắt đầu tới hoàn thành) và cự ly thực tính từ tốc độ cảm biến (khoảng giữa hai điểm đo tính tối đa 5 giây). Ai xem được hồ sơ ngựa thì xem được.

### 7. Bàn giao khi Head Trainer nghỉ

1. Club Manager bàn giao một lần: mọi khu chuồng, mọi giáo án và mọi lớp đang chạy của Head Trainer A sang Head Trainer B, trong một transaction. Lớp đã hoàn thành hoặc đã hủy giữ A để tra lịch sử.
2. Mỗi khu được chuyển ghi một dòng nhật ký.
3. Không khóa tài khoản hay đổi vai trò Head Trainer còn khu chuồng, còn giáo án, hoặc còn lớp đang chạy.
4. Sửa khu chuồng (`PATCH /barns/:id`) để đổi từ Head Trainer A sang B bị chặn (409) khi A còn lớp ACTIVE có ghi danh ACTIVE của ngựa đang thuộc khu; gỡ Head Trainer (null) theo luật cũ. Muốn đổi thì cho ngựa rời lớp hoặc hoàn thành lớp, hoặc dùng bàn giao.

### 8. Phân quyền

| Thao tác | CM | HT | VET | GROOM | OWNER |
|---|---|---|---|---|---|
| Danh mục môn học | Thêm, sửa, xóa, xem | Xem | Xem | Xem | Không |
| Giáo án | Xem tất cả | Của mình | Không | Không | Không |
| Lớp, buổi tập (xem) | Tất cả | Lớp mình phụ trách | Tất cả | Lớp có lượt mình dắt | Lớp có ngựa của mình |
| Tạo, sửa lớp, buổi, chạy thử, ghi danh | Không | Lớp mình phụ trách | Không | Không | Không |
| Điểm danh, báo vắng, báo sẵn sàng | Không | Lớp mình phụ trách, ngựa thuộc khu mình | Không | Lượt mình được giao | Không |
| Bắt đầu, hoàn thành lượt, ghi kết quả chạy thử | Không | Lớp mình phụ trách, ngựa thuộc khu mình | Không | Không | Không |
| Đánh giá buổi | Không | Có | Không | Không | Không |
| Ngưỡng nhịp tim/tốc độ | Xem | Đặt cho ngựa thuộc khu mình | Xem | Không | Không |
| Bàn giao Head Trainer | Có | Không | Không | Không | Không |

## IV. API

| Phương thức | Đường dẫn | Ai gọi | Công dụng |
|---|---|---|---|
| GET | `/training-subjects` | CM, HT, VET, GROOM | Danh mục môn |
| GET | `/training-subjects/:subjectId` | CM, HT, VET, GROOM | Một môn |
| POST | `/training-subjects` | CM | Thêm môn |
| PATCH | `/training-subjects/:subjectId` | CM | Sửa môn (gửi `null` để xóa field tùy chọn) |
| DELETE | `/training-subjects/:subjectId` | CM | Xóa môn chưa dùng |
| GET | `/training-plans` | HT (của mình), CM | Danh sách giáo án kèm giai đoạn, môn, `totalWeeks`, `minTotalMinutes` |
| GET | `/training-plans/:id` | HT (của mình), CM | Một giáo án |
| POST | `/training-plans` | HT | Tạo giáo án `{ name, description?, phases: [{ weeks, subjects: [{ subjectId, minSessionsPerWeek }] }] }` |
| PUT | `/training-plans/:id` | HT (của mình) | Thay toàn bộ giáo án |
| DELETE | `/training-plans/:id` | HT (của mình) | Xóa giáo án chưa có lớp |
| GET | `/classes` | Theo quyền xem lớp | Danh sách lớp |
| GET | `/classes/:classId` | Theo quyền xem lớp | Một lớp |
| GET | `/classes/:classId/plan` | Theo quyền xem lớp | Giáo án của lớp kèm khoảng ngày, thời lượng tối thiểu từng giai đoạn |
| GET | `/classes/:classId/progress` | Theo quyền xem lớp | Tiến độ xếp lịch theo tuần so với số buổi tối thiểu |
| POST | `/classes` | HT | Tạo lớp `{ code, name, ..., planId, startDate }`, chưa có buổi |
| PATCH | `/classes/:classId` | HT | Sửa lớp (không đổi giáo án, Head Trainer) |
| PATCH | `/classes/:classId/status` | HT | Hoàn thành, hủy lớp |
| GET | `/classes/:classId/enrollments` | Theo quyền xem lớp | Ghi danh của lớp, kèm `horseName`, `horsePhotoUrl` |
| GET | `/classes/:classId/enrollable-horses` | HT của lớp | Ngựa ghi danh được lúc này (bỏ ngựa đã ghi danh, ngựa trùng giờ) |
| POST | `/classes/:classId/enrollments` | HT | Ghi danh ngựa vào lớp |
| PATCH | `/enrollments/:id/leave` | HT | Cho ngựa rời lớp |
| GET/POST | `/classes/:classId/sessions` | Xem: theo quyền xem lớp; thêm: HT | Buổi của lớp |
| POST | `/classes/:classId/sessions/bulk` | HT | Thêm nhiều buổi một lần `{ sessions: [...] }` |
| GET | `/training-sessions/:sessionId` | Theo quyền xem lớp | Một buổi |
| PATCH | `/training-sessions/:sessionId` | HT | Sửa buổi chưa tới giờ, chưa có ngựa điểm danh; đổi được `subjectId` (gửi `null` để xóa `location`, `surface`, `notes`) |
| POST | `/training-sessions/:sessionId/cancel` | HT | Hủy buổi |
| GET | `/training-sessions/:sessionId/participants` | Theo quyền xem buổi | Lượt tập của buổi, kèm `horseName`, `horsePhotoUrl`, `assignedGroomName` |
| GET/POST | `/training-sessions/:id/time-trial` | Xem: theo quyền xem buổi; tạo: HT | Cấu hình chạy thử của buổi |
| PATCH | `/training-sessions/:id/time-trial` | HT | Sửa cấu hình chạy thử của buổi chưa tới giờ |
| GET | `/time-trials/:id` | Theo quyền xem buổi | Một cấu hình chạy thử |
| PATCH | `/session-participants/:id/groom` | HT | Giao Groom dắt ngựa |
| GET/POST | `/session-participants/:id/trial-results` | Xem: theo quyền xem lượt; ghi: HT | Kết quả chạy thử của lượt |
| PATCH | `/session-participants/:id/trial-results/:attemptNo` | HT | Gắn, đổi hoặc gỡ video của một lần chạy thử `{ videoMediaId }` |
| GET/POST | `/session-participants/:id/evaluation` | Xem: theo quyền xem lượt; ghi: HT | Đánh giá lượt tập |
| POST | `/session-participants/:id/check-in`, `/ready`, `/absent` | HT, GROOM | Điểm danh, báo sẵn sàng, báo vắng |
| POST | `/session-participants/:id/start`, `/complete` | HT | Bắt đầu, hoàn thành lượt tập |
| POST | `/session-participants/:id/metrics`, `/metrics/batch` | Không cần đăng nhập | Nhận điểm đo (giả lập) |
| GET | `/session-participants/:id/metrics` | CM, VET, HT | Điểm đo của lượt theo thời gian |
| GET | `/session-participants/:id/performance-summary` | CM, VET, HT, OWNER, và phải xem được lượt | Tổng kết nhịp tim, tốc độ, số cảnh báo |
| GET | `/horses/:id/alerts` | CM, VET, HT của khu | Lịch sử cảnh báo `?level&from&to&page&limit` |
| GET | `/horses/:id/workload` | Ai xem được hồ sơ ngựa | Khối lượng tập `?from&to` |
| GET | `/horses/:horseId/training/classes`, `/horses/:horseId/training/sessions` | CM, HT, VET, OWNER | Lớp và buổi tập của ngựa (tab huấn luyện) |
| GET/PUT | `/horses/:id/thresholds` | Xem: HT, CM, VET; đặt: HT | Ngưỡng của ngựa |
| POST | `/users/:id/head-trainer-handover` | CM | Bàn giao Head Trainer `{ toHeadTrainerId }` |

Chi tiết schema: `docs/api-catalog.md`, `docs/openapi.contracts.json`.

## Phụ lục: Việc còn lại

- Route nhận điểm đo đang public: nợ mục 5 ở `docs/mongo-notifications-debt.md`.
