-- Dữ liệu ảo cho môi trường dev. Chạy: pnpm db:seed (sau pnpm db:migrate)
--
-- Users: 5 tài khoản (mỗi role 1 người) khớp với user có sẵn trên Keycloak local
-- (realm racehorse). keycloak_id phải trùng `sub` trên Keycloak thì mới đăng nhập được;
-- nếu Keycloak của máy khác có sub khác thì sửa keycloak_id ở phần users bên dưới.
-- Các phần sau lấy user theo role (user ACTIVE tạo sớm nhất của mỗi role).
--
-- Chạy lại nhiều lần được: mọi bản ghi dùng id cố định + ON CONFLICT (id) DO NOTHING.
-- Bản ghi đã có thì giữ nguyên (không reset trạng thái đã đổi trong lúc test).
--
-- Quy ước id: barns b0.., stalls c0.., horses a0.., stall_assignments d0..,
-- groom_assignments 70.., horse_ownerships e0.., training_locks f0..

DO $$
DECLARE
  head_trainer_id uuid;
  vet_id uuid;
  groom_id uuid;
  owner_id uuid;
BEGIN
  -- ── Users ───────────────────────────────────────────────────
  INSERT INTO users (id, keycloak_id, full_name, email, role, status, version) VALUES
    ('4d2f2949-9d29-4a64-81c0-807c481188f1', 'b4c48b7a-f2ee-4352-9a9c-37cd81ef3297', 'Nguyễn Nhật Trường', 'nhatruong5012@gmail.com', 'CLUB_MANAGER', 'ACTIVE', 1),
    ('91315bf7-3eef-4d8c-a403-c20245b6cb36', '816cb58c-65e2-4e89-8d6a-401b8d0bae16', 'Nguyễn Văn A', 'nhatruong5020@gmail.com', 'HEAD_TRAINER', 'ACTIVE', 1),
    ('0831b413-cf10-445e-96eb-97f354ef517d', '810c144f-3a62-49cf-bc7e-6216f26b1878', 'Nguyen Van B', 'nhattruong.nguyen0512@gmail.com', 'HORSE_OWNER', 'ACTIVE', 1),
    ('793a2d08-28af-4652-9988-037be0d111de', '9d06deae-0a99-4da8-a526-56960343cbf0', 'Nguyen Van C', 'tnhdarkrai1457@gmail.com', 'GROOM', 'ACTIVE', 1),
    ('d5a2188a-ab75-4537-b370-ddfc7c31e8ae', '91fab7dc-721c-4d94-85f1-dcb279b24629', 'Nguyen Van C', 'minhff.net@gmail.com', 'VETERINARIAN', 'ACTIVE', 1)
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO head_trainer_id FROM users
    WHERE role = 'HEAD_TRAINER' AND status = 'ACTIVE' AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
  SELECT id INTO vet_id FROM users
    WHERE role = 'VETERINARIAN' AND status = 'ACTIVE' AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
  SELECT id INTO groom_id FROM users
    WHERE role = 'GROOM' AND status = 'ACTIVE' AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
  SELECT id INTO owner_id FROM users
    WHERE role = 'HORSE_OWNER' AND status = 'ACTIVE' AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;

  IF head_trainer_id IS NULL OR vet_id IS NULL OR groom_id IS NULL OR owner_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu user ACTIVE cho role: %',
      concat_ws(', ',
        CASE WHEN head_trainer_id IS NULL THEN 'HEAD_TRAINER' END,
        CASE WHEN vet_id IS NULL THEN 'VETERINARIAN' END,
        CASE WHEN groom_id IS NULL THEN 'GROOM' END,
        CASE WHEN owner_id IS NULL THEN 'HORSE_OWNER' END);
  END IF;

  -- ── Khu chuồng ──────────────────────────────────────────────
  -- Khu A có head trainer, khu B chưa có, khu cách ly cho ngựa QUARANTINED.
  INSERT INTO barns (id, name, description, capacity, status, head_trainer_id, version) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'Khu A (seed)', 'Khu chính, có head trainer', 8, 'ACTIVE', head_trainer_id, 1),
    ('b0000000-0000-4000-8000-000000000002', 'Khu B (seed)', 'Khu phụ, chưa có head trainer', 6, 'ACTIVE', NULL, 1),
    ('b0000000-0000-4000-8000-000000000003', 'Khu cách ly (seed)', 'Ô cách ly ngựa nghi nhiễm bệnh', 3, 'ACTIVE', NULL, 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Ô chuồng ────────────────────────────────────────────────
  INSERT INTO stalls (id, barn_id, code, type, status, has_camera, version) VALUES
    ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'SD-A01', 'STANDARD', 'OCCUPIED', true, 1),
    ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'SD-A02', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'SD-A03', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'SD-A04', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'SD-A05', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'SD-A06', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'SD-A07', 'STANDARD', 'AVAILABLE', false, 1),
    ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002', 'SD-B01', 'RECOVERY', 'OCCUPIED', true, 1),
    ('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000002', 'SD-B02', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000002', 'SD-B03', 'STANDARD', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000002', 'SD-B04', 'RECOVERY', 'OCCUPIED', false, 1),
    ('c0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000002', 'SD-B05', 'STANDARD', 'MAINTENANCE', false, 1),
    ('c0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000003', 'SD-I01', 'ISOLATION', 'OCCUPIED', true, 1),
    ('c0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000003', 'SD-I02', 'ISOLATION', 'OCCUPIED', true, 1),
    ('c0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000003', 'SD-I03', 'ISOLATION', 'AVAILABLE', true, 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Ngựa tham chiếu (tổ tiên trong phả hệ, không thuộc đàn) ──
  INSERT INTO horses (id, name, gender, breed, color, race_aptitude, is_reference, date_of_birth, microchip_id, sire_id, dam_id, health_status, lifecycle_status, version) VALUES
    ('a0000000-0000-4000-8000-000000000901', 'Northern Star', 'MALE', 'Thoroughbred', 'Bay', 'STAYER', true, '2008-04-12', NULL, NULL, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a0000000-0000-4000-8000-000000000902', 'Sea Breeze', 'FEMALE', 'Thoroughbred', 'Chestnut', 'MILER', true, '2010-03-05', NULL, NULL, NULL, 'ELIGIBLE', 'ACTIVE', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Ngựa của câu lạc bộ ──────────────────────────────────────
  -- Phủ đủ: 4 health x 3 lifecycle, 3 giới tính, 3 cự ly, có/không chip,
  -- có/không ô chuồng, có training lock, hồ sơ thiếu thông tin, hồ sơ đã xóa.
  INSERT INTO horses (id, name, gender, breed, color, race_aptitude, is_reference, date_of_birth, microchip_id, sire_id, dam_id, health_status, lifecycle_status, deleted_at, version) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'Sao Mai', 'MALE', 'Thoroughbred', 'Bay', 'SPRINTER', false, '2019-02-10', '900000000000001', 'a0000000-0000-4000-8000-000000000901', 'a0000000-0000-4000-8000-000000000902', 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000002', 'Gió Bắc', 'GELDING', 'Arabian', 'Grey', 'MILER', false, '2018-05-21', '900000000000002', 'a0000000-0000-4000-8000-000000000901', NULL, 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000003', 'Hỏa Long', 'MALE', 'Thoroughbred', 'Chestnut', 'STAYER', false, '2017-08-03', '900000000000003', NULL, NULL, 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000004', 'Bạch Vân', 'FEMALE', 'Arabian', 'White', 'MILER', false, '2020-01-15', '900000000000004', NULL, 'a0000000-0000-4000-8000-000000000902', 'UNDER_OBSERVATION', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000005', 'Thiên Lý', 'MALE', 'Thoroughbred', 'Black', 'SPRINTER', false, '2018-11-30', '900000000000005', NULL, NULL, 'INJURED', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000006', 'Hắc Phong', 'GELDING', 'Quarter Horse', 'Black', 'STAYER', false, '2016-07-07', '900000000000006', NULL, NULL, 'QUARANTINED', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000007', 'Ngọc Lan', 'FEMALE', 'Thoroughbred', 'Bay', 'SPRINTER', false, '2021-03-18', NULL, NULL, NULL, 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000008', 'Kim Ô', 'MALE', 'Arabian', 'Palomino', 'MILER', false, '2012-09-09', '900000000000008', NULL, NULL, 'ELIGIBLE', 'RETIRED', NULL, 1),
    ('a0000000-0000-4000-8000-000000000009', 'Tuyết Sơn', 'FEMALE', 'Thoroughbred', 'Grey', 'STAYER', false, '2011-12-01', '900000000000009', NULL, NULL, 'UNDER_OBSERVATION', 'RETIRED', NULL, 1),
    ('a0000000-0000-4000-8000-000000000010', 'Phong Vân', 'MALE', 'Thoroughbred', 'Bay', 'MILER', false, '2015-06-14', '900000000000010', NULL, NULL, 'ELIGIBLE', 'TRANSFERRED', NULL, 1),
    ('a0000000-0000-4000-8000-000000000011', 'Lam Giang', 'FEMALE', 'Arabian', 'Chestnut', 'SPRINTER', false, '2019-10-22', '900000000000011', NULL, NULL, 'INJURED', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000012', 'Đại Bàng', 'GELDING', 'Thoroughbred', 'Dark Bay', 'MILER', false, '2018-04-04', '900000000000012', NULL, NULL, 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000013', 'Xích Thố', 'MALE', 'Thoroughbred', 'Chestnut', 'STAYER', false, '2017-01-27', '900000000000013', NULL, NULL, 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000014', 'Vô Danh', NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, 'ELIGIBLE', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000015', 'Hồng Hạc', 'FEMALE', 'Arabian', 'Grey', 'MILER', false, '2020-08-08', '900000000000015', NULL, NULL, 'QUARANTINED', 'ACTIVE', NULL, 1),
    ('a0000000-0000-4000-8000-000000000016', 'Bóng Đêm (đã xóa)', 'MALE', 'Thoroughbred', 'Black', 'SPRINTER', false, '2016-02-02', '900000000000016', NULL, NULL, 'ELIGIBLE', 'ACTIVE', now() - interval '10 days', 1),
    ('a0000000-0000-4000-8000-000000000017', 'Sương Mù (đã xóa)', 'FEMALE', 'Arabian', 'Grey', 'STAYER', false, '2013-05-05', NULL, NULL, NULL, 'INJURED', 'RETIRED', now() - interval '30 days', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Xếp ô chuồng (đang mở: end_at NULL) ─────────────────────
  -- Ngựa không có dòng mở ở đây -> barn/stall = null: Ngọc Lan, Phong Vân (đã chuyển nhượng), Vô Danh.
  INSERT INTO stall_assignments (id, horse_id, stall_id, start_at, end_at, version) VALUES
    ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', now() - interval '90 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', now() - interval '80 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', now() - interval '70 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', now() - interval '60 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000011', now() - interval '20 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000021', now() - interval '5 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000012', now() - interval '400 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000013', now() - interval '300 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000014', now() - interval '15 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000005', now() - interval '50 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000006', now() - interval '40 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000015', 'c0000000-0000-4000-8000-000000000022', now() - interval '3 days', NULL, 1),
    ('d0000000-0000-4000-8000-000000000100', 'a0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000007', now() - interval '500 days', now() - interval '100 days', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Groom phụ trách (độc lập với ô chuồng) ──────────────────
  -- Ngọc Lan chưa vào chuồng nhưng đã có groom; Phong Vân đã chuyển nhượng nên groom đã đóng.
  -- ON CONFLICT DO NOTHING (không chỉ id): DB đã migrate có sẵn dòng copy từ stall_assignments.
  INSERT INTO groom_assignments (id, horse_id, groom_id, start_at, end_at, version) VALUES
    ('70000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', groom_id, now() - interval '90 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', groom_id, now() - interval '80 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', groom_id, now() - interval '70 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', groom_id, now() - interval '60 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', groom_id, now() - interval '20 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006', groom_id, now() - interval '5 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000007', groom_id, now() - interval '7 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000008', groom_id, now() - interval '400 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000009', groom_id, now() - interval '300 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', groom_id, now() - interval '15 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000012', groom_id, now() - interval '50 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000013', groom_id, now() - interval '40 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000015', groom_id, now() - interval '3 days', NULL, 1),
    ('70000000-0000-4000-8000-000000000100', 'a0000000-0000-4000-8000-000000000010', groom_id, now() - interval '500 days', now() - interval '100 days', 1)
  ON CONFLICT DO NOTHING;

  -- ── Sở hữu ──────────────────────────────────────────────────
  -- Owner đang sở hữu 4 con; 1 ownership đã đóng (Phong Vân đã chuyển nhượng).
  INSERT INTO horse_ownerships (id, horse_id, owner_id, percentage, start_at, end_at, version) VALUES
    ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', owner_id, 100, '2021-01-01 00:00+07', NULL, 1),
    ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', owner_id, 100, '2022-03-01 00:00+07', NULL, 1),
    ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', owner_id, 100, '2020-06-01 00:00+07', NULL, 1),
    ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000011', owner_id, 100, '2021-09-01 00:00+07', NULL, 1),
    ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000010', owner_id, 100, '2018-01-01 00:00+07', '2025-06-01 00:00+07', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Training lock ───────────────────────────────────────────
  -- Hỏa Long: ELIGIBLE + ACTIVE nhưng đang bị khóa -> canRegisterRace = false.
  -- Thiên Lý: chấn thương, đang bị khóa.
  -- Xích Thố: lock đã RELEASED -> canRegisterRace = true.
  INSERT INTO training_locks (id, horse_id, locked_by, reason, lock_start, lock_end, status, released_by, released_at, release_conclusion, version) VALUES
    ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', vet_id, 'Theo dõi sau tiêm phòng', now() - interval '2 days', NULL, 'ACTIVE', NULL, NULL, NULL, 1),
    ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005', vet_id, 'Tổn thương gân chân trước trái', now() - interval '20 days', NULL, 'ACTIVE', NULL, NULL, NULL, 1),
    ('f0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000013', vet_id, 'Sưng khớp nhẹ', now() - interval '30 days', now() - interval '10 days', 'RELEASED', vet_id, now() - interval '10 days', 'Hồi phục hoàn toàn', 1)
  ON CONFLICT (id) DO NOTHING;
END $$;
