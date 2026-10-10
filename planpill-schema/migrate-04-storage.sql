-- ============================================================
--  PlanPill — migration 04: ที่เก็บรูปอาหาร (Supabase Storage)
--
--  รันหลัง migrate-03-meal-rpc.sql
--
--  แนวคิดเรื่องความปลอดภัย
--    bucket นี้เป็นแบบ private (public = false) จึงเปิดรูปด้วย URL ตรง ๆ ไม่ได้
--    แอปต้องขอ signed URL ที่หมดอายุในเวลาสั้น ๆ ทุกครั้งที่จะแสดงรูป
--
--    ชื่อไฟล์บังคับรูปแบบ  <user_id>/<meal_id>.jpg
--    policy ด้านล่างจึงเทียบโฟลเดอร์ชั้นแรกกับ auth.uid() ของผู้เรียก
--    ผลคือผู้ใช้เห็น อัปโหลด และลบได้เฉพาะรูปในโฟลเดอร์ของตัวเองเท่านั้น
--    (หลักเดียวกับ RLS ของตาราง meals เพื่อให้ทั้งสองชั้นสอดคล้องกัน)
-- ============================================================

-- สร้าง bucket แบบ private
-- on conflict do nothing เพื่อให้รันซ้ำได้โดยไม่พัง
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  5242880,                                   -- 5 MB ต่อรูป กันไฟล์ใหญ่เกินจำเป็น
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ลบ policy เดิมก่อน เผื่อรันซ้ำ
drop policy if exists "read own meal photos"   on storage.objects;
drop policy if exists "upload own meal photos" on storage.objects;
drop policy if exists "update own meal photos" on storage.objects;
drop policy if exists "delete own meal photos" on storage.objects;

-- storage.foldername(name) แยกชื่อไฟล์เป็นอาร์เรย์ของโฟลเดอร์
-- ตัวที่ [1] คือโฟลเดอร์ชั้นแรก ซึ่งเราบังคับให้เป็น user_id
create policy "read own meal photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "upload own meal photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ต้องมี update ด้วย เพราะแอปอัปโหลดทับไฟล์เดิมเมื่อผู้ใช้เปลี่ยนรูปของมื้อเดิม
create policy "update own meal photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "delete own meal photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
