-- ============================================================
--  PlanPill — migration 05: เก็บเวลาที่ล้างประวัติไว้บนเซิร์ฟเวอร์
--
--  รันหลัง migrate-04-storage.sql
--
--  ปัญหาที่แก้
--    เดิมเวลาที่ผู้ใช้กด "ล้างประวัติ" เก็บไว้ในเครื่องเท่านั้น
--    ถ้าล้างที่เครื่อง A แล้วเปิดแอปที่เครื่อง B เครื่อง B จะไม่รู้ว่าเคยล้าง
--    แล้วสร้างมื้อย้อนหลัง 7 วันขึ้นมาใหม่เป็น "ไม่ได้บันทึก" ทั้งหมด
--    พร้อมอัปโหลดกลับขึ้นเซิร์ฟเวอร์ ประวัติที่ล้างไปจึงกลับมาในสภาพที่ผิดจากความจริง
--
--  วิธีแก้มีสองชั้น
--    1. ตาราง user_settings เก็บเวลาที่ล้าง ทุกเครื่องอ่านค่าเดียวกัน
--    2. trigger บนตาราง dose_logs ปฏิเสธประวัติที่ "ระบบสร้างเอง" ของมื้อก่อนเวลาที่ล้าง
--       ชั้นนี้กันกรณีที่แอปฝั่งเครื่องกันไม่ได้ เช่นเครื่องที่ออฟไลน์อยู่ตอนล้าง
--       แล้วส่งงานเก่าที่ค้างในคิวขึ้นมาทีหลัง
-- ============================================================

-- ---------- 1. ตารางการตั้งค่าของผู้ใช้ ----------

-- ผู้ใช้ 1 คนมีได้แถวเดียว จึงใช้ user_id เป็น primary key เลย
create table if not exists user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  -- null = ไม่เคยล้างประวัติ
  history_cleared_at timestamptz,
  updated_at         timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "own user_settings" on user_settings;
create policy "own user_settings" on user_settings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ใช้ function set_updated_at() ตัวเดียวกับตาราง medications (สร้างไว้ใน schema.sql)
drop trigger if exists user_settings_set_updated_at on user_settings;
create trigger user_settings_set_updated_at
  before update on user_settings
  for each row execute function set_updated_at();

comment on table user_settings is
  'การตั้งค่าที่ต้องตรงกันทุกเครื่องของผู้ใช้คนเดียวกัน ตอนนี้มีแค่เวลาที่ล้างประวัติ';


-- ---------- 2. กันประวัติที่ถูกล้างไปแล้วกลับมา ----------

-- ปฏิเสธเฉพาะประวัติที่ระบบสร้างเอง (source เป็น null หรือ auto) เท่านั้น
-- ประวัติที่ผู้ใช้กดเอง (manual) ผ่านเสมอ เพราะเป็นการกระทำที่ผู้ใช้ตั้งใจหลังจากล้างแล้ว
-- เช่น กดบันทึกย้อนหลังมื้อที่ลืม
--
-- return null ใน before insert trigger = ข้ามแถวนั้นไปเงียบ ๆ ไม่ขึ้น error
-- ตั้งใจไม่ขึ้น error เพราะถ้า error คิว outbox ของเครื่องที่ส่งมาจะค้างทั้งคิว
--
-- ไม่ใช้ security definer เหตุผลเดียวกับ RPC ใน schema.sql
-- คนที่ insert คือเจ้าของแถว จึงอ่าน user_settings ของตัวเองได้ผ่าน RLS อยู่แล้ว
create or replace function skip_cleared_auto_logs()
returns trigger
language plpgsql
as $$
declare
  v_cleared_at timestamptz;
begin
  if new.source = 'manual' then
    return new;
  end if;

  select history_cleared_at
    into v_cleared_at
    from user_settings
   where user_id = new.user_id;

  if v_cleared_at is not null and new.scheduled_at < v_cleared_at then
    return null;
  end if;

  return new;
end;
$$;

-- ผูกเฉพาะ insert เพราะปัญหาคือการ "สร้างกลับขึ้นมาใหม่" หลังถูกลบ
-- upsert ที่เจอแถวเดิมจะไปทาง update ซึ่งแปลว่าแถวนั้นยังไม่ถูกล้าง
drop trigger if exists dose_logs_skip_cleared on dose_logs;
create trigger dose_logs_skip_cleared
  before insert on dose_logs
  for each row execute function skip_cleared_auto_logs();

comment on function skip_cleared_auto_logs() is
  'ไม่ให้ประวัติที่ระบบสร้างเองของมื้อก่อนเวลาที่ผู้ใช้ล้างประวัติ ถูกเขียนกลับเข้ามา';
