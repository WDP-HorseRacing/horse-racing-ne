-- Thêm 10 ngựa demo mà không tạo barns hoặc dữ liệu seed khác.
DO $$
DECLARE
  seed_owner_id uuid;
  manager_user_id uuid;
BEGIN
  SELECT id INTO seed_owner_id
    FROM users
   WHERE role = 'HORSE_OWNER' AND status = 'ACTIVE' AND deleted_at IS NULL
   ORDER BY created_at
   LIMIT 1;

  SELECT id INTO manager_user_id
    FROM users
   WHERE role = 'CLUB_MANAGER' AND status = 'ACTIVE' AND deleted_at IS NULL
   ORDER BY created_at
   LIMIT 1;

  IF seed_owner_id IS NULL OR manager_user_id IS NULL THEN
    RAISE EXCEPTION 'Cần có user ACTIVE cho HORSE_OWNER và CLUB_MANAGER trước khi seed ngựa';
  END IF;

  INSERT INTO horses (
    id, name, gender, breed, color, race_aptitude, date_of_birth,
    microchip_id, owner_id, barn_id, health_status, lifecycle_status, version
  ) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Tia Chớp', 'MALE', 'Thoroughbred', 'Bay', 'SPRINTER', '2018-02-11', '910000000000001', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000002', 'Mây Trắng', 'FEMALE', 'Arabian', 'Grey', 'STAYER', '2020-06-15', '910000000000002', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000003', 'Sao Băng', 'GELDING', 'Quarter Horse', 'Chestnut', 'MILER', '2017-09-03', '910000000000003', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000004', 'Bình Minh', 'FEMALE', 'Thoroughbred', 'Black', 'SPRINTER', '2019-04-20', '910000000000004', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000005', 'Hắc Vân', 'MALE', 'Arabian', 'Palomino', 'MILER', '2016-01-12', '910000000000005', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000006', 'Nguyệt Quế', 'FEMALE', 'Thoroughbred', 'Dark Bay', 'STAYER', '2021-07-22', '910000000000006', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000007', 'Lửa Thiêng', 'MALE', 'Quarter Horse', 'Sorrel', 'MILER', '2018-10-05', '910000000000007', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000008', 'Thảo Nguyên', 'GELDING', 'Arabian', 'White', 'STAYER', '2015-08-30', '910000000000008', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000009', 'Bão Cát', 'FEMALE', 'Thoroughbred', 'Chestnut', 'SPRINTER', '2020-03-18', '910000000000009', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1),
    ('a1000000-0000-4000-8000-000000000010', 'Đường Đua', 'MALE', 'Arabian', 'Black', 'MILER', '2017-11-09', '910000000000010', seed_owner_id, NULL, 'ELIGIBLE', 'ACTIVE', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO horse_ownerships (horse_id, owner_id, started_at, recorded_by, version)
  SELECT h.id, h.owner_id, h.created_at, manager_user_id, 1
    FROM horses h
   WHERE h.id::text LIKE 'a1000000-0000-4000-8000-%'
     AND h.owner_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM horse_ownerships o
        WHERE o.horse_id = h.id AND o.ended_at IS NULL
     );

  INSERT INTO audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data,
    reason, feature, created_at
  )
  SELECT manager_user_id, 'CREATE', 'HORSE', h.id, NULL,
         jsonb_build_object(
           'name', h.name, 'gender', h.gender, 'breed', h.breed,
           'color', h.color, 'raceAptitude', h.race_aptitude,
           'dateOfBirth', h.date_of_birth, 'microchipId', h.microchip_id,
           'ownerId', h.owner_id, 'barnId', h.barn_id,
           'healthStatus', h.health_status, 'lifecycleStatus', h.lifecycle_status
         ),
         NULL, 'HORSE_CREATE', h.created_at
    FROM horses h
   WHERE h.id::text LIKE 'a1000000-0000-4000-8000-%'
     AND NOT EXISTS (
       SELECT 1 FROM audit_logs a
        WHERE a.entity_id = h.id AND a.feature = 'HORSE_CREATE'
     );
END $$;
