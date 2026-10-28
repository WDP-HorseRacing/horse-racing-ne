-- Chỉ tạo/cập nhật 5 tài khoản seed và liên kết đúng ID Keycloak.
INSERT INTO users (id, keycloak_id, full_name, email, role, status, version) VALUES
  ('4d2f2949-9d29-4a64-81c0-807c481188f1', '__KC_CLUB_MANAGER_ID__', 'Nguyễn Nhật Trường', 'nhatruong5012@gmail.com', 'CLUB_MANAGER', 'ACTIVE', 1),
  ('91315bf7-3eef-4d8c-a403-c20245b6cb36', '__KC_HEAD_TRAINER_ID__', 'Nguyễn Văn A', 'nhatruong5020@gmail.com', 'HEAD_TRAINER', 'ACTIVE', 1),
  ('0831b413-cf10-445e-96eb-97f354ef517d', '__KC_HORSE_OWNER_ID__', 'Nguyen Van B', 'nhattruong.nguyen0512@gmail.com', 'HORSE_OWNER', 'ACTIVE', 1),
  ('793a2d08-28af-4652-9988-037be0d111de', '__KC_GROOM_ID__', 'Nguyen Van C', 'tnhdarkrai1457@gmail.com', 'GROOM', 'ACTIVE', 1),
  ('d5a2188a-ab75-4537-b370-ddfc7c31e8ae', '__KC_VETERINARIAN_ID__', 'Nguyen Van C', 'minhff.net@gmail.com', 'VETERINARIAN', 'ACTIVE', 1)
ON CONFLICT (id) DO UPDATE SET keycloak_id = EXCLUDED.keycloak_id;
