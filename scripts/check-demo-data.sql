-- Kiểm dữ liệu ngựa và ô chuồng sau khi chạy `npm run db:migrate` trên DB demo.
-- Mỗi câu phải trả 0 dòng. Có dòng thì sửa tay trước buổi demo.
-- Chạy: psql "$DATABASE_URL" -f scripts/check-demo-data.sql
-- Hoặc qua docker: docker exec -i <container-postgres> psql -U <user> -d <db> < scripts/check-demo-data.sql

-- 1. Ngựa dưới 1 tuổi (theo ngày lịch Việt Nam)
SELECT id, name, date_of_birth
FROM horses
WHERE deleted_at IS NULL
  AND date_of_birth > ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '1 year');

-- 2. Ngựa quá 40 tuổi
SELECT id, name, date_of_birth
FROM horses
WHERE deleted_at IS NULL
  AND date_of_birth < ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '40 years');

-- 3. Cha hoặc mẹ lớn hơn con chưa tới 2 năm
SELECT c.id, c.name, c.date_of_birth, p.id AS parent_id, p.name AS parent_name, p.date_of_birth AS parent_dob
FROM horses c
JOIN horses p ON p.id IN (c.sire_id, c.dam_id)
WHERE c.deleted_at IS NULL
  AND c.date_of_birth IS NOT NULL
  AND p.date_of_birth IS NOT NULL
  AND p.date_of_birth > c.date_of_birth - INTERVAL '2 years';

-- 4. Ô chuồng loại FOALING (đã bỏ)
SELECT id, code, barn_id, type
FROM stalls
WHERE type = 'FOALING';
