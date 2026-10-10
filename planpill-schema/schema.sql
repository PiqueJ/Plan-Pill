-- ============================================================
--  PlanPill — Supabase schema
--
--  รันไฟล์นี้ใน Supabase Dashboard > SQL Editor (รันครั้งเดียวตอนตั้งโปรเจกต์)
--
--  โครงสร้างแบ่งเป็น 2 กลุ่ม
--    1. ตารางอ้างอิง  — ข้อมูลกลางจาก DDInter 2.0 ผู้ใช้ทุกคนอ่านได้ แต่แก้ไม่ได้
--    2. ตารางผู้ใช้   — ข้อมูลส่วนตัว ป้องกันด้วย Row Level Security (RLS)
-- ============================================================

-- extension สำหรับค้นหาชื่อยาแบบใกล้เคียง (fuzzy search)
create extension if not exists pg_trgm;


-- ============================================================
--  ENUM
-- ============================================================

-- ระดับความรุนแรงของปฏิกิริยา ใช้คำเดียวกับ DDInter เพื่อให้ import ตรง ๆ ได้
create type severity_level as enum ('major', 'moderate', 'minor');

-- ความสัมพันธ์ระหว่างยากับมื้ออาหาร
create type meal_relation as enum (
  'before_meal',   -- ก่อนอาหาร
  'after_meal',    -- หลังอาหาร
  'with_meal',     -- พร้อมอาหาร
  'independent'    -- ไม่เกี่ยวกับมื้ออาหาร
);

create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- สถานะของยา 1 มื้อ (ไม่มี sensor แล้ว จึงไม่มีสถานะ drawer_opened เหมือน PlanPill เดิม)
create type dose_status as enum (
  'upcoming',   -- ยังไม่ถึงเวลา
  'reminded',   -- แจ้งเตือนแล้ว รอผู้ใช้ยืนยัน
  'taken',      -- ผู้ใช้กดยืนยันว่ารับประทานแล้ว
  'skipped',    -- ผู้ใช้กดข้ามมื้อนี้
  'missed'      -- เลยเวลามาแล้วโดยไม่มีการยืนยัน (ระบบตั้งให้อัตโนมัติ)
);

-- ที่มาของการบันทึก: ผู้ใช้กดเอง หรือระบบตั้งให้อัตโนมัติ
create type log_source as enum ('manual', 'auto');


-- ============================================================
--  1. ตารางอ้างอิง
-- ============================================================

-- หมวดอาหารที่มีข้อควรระวังทางยา (ผู้ใช้ติ๊กเลือกตอนบันทึกมื้ออาหาร)
create table food_categories (
  code        text primary key,       -- 'dairy', 'vitamin_k', ...
  label_th    text not null,          -- ชื่อหมวดภาษาไทยที่แสดงในแอป
  examples_th text not null,          -- ตัวอย่างอาหาร ช่วยให้ผู้ใช้เลือกถูกหมวด
  sort_order  int  not null default 0
);

-- ยาอ้างอิง — ชื่อสามัญคงภาษาอังกฤษไว้ตามมาตรฐานสากล ไม่แปล
create table drug_reference (
  id          uuid primary key default gen_random_uuid(),
  name_en     text not null unique,   -- 'Paracetamol'
  category_th text,                   -- 'ยาแก้ปวด / ลดไข้' (null ได้ ถ้ายังไม่ได้ระบุหมวด)
  created_at  timestamptz not null default now()
);

-- ปฏิกิริยา ยา ↔ หมวดอาหาร (คัดจากหน้า Drug-Others Interaction ของ DDInter 2.0)
create table drug_food_interactions (
  id            uuid primary key default gen_random_uuid(),
  drug_id       uuid not null references drug_reference(id) on delete cascade,
  food_code     text not null references food_categories(code) on delete cascade,
  severity      severity_level not null,
  mechanism_th  text not null,        -- แปลเป็นไทยตอน curate ข้อมูล
  management_th text not null,
  source_note   text,                 -- ที่มาของข้อมูล เช่น 'DDInter 2.0'
  unique (drug_id, food_code)         -- กันข้อมูลซ้ำ 1 คู่มีได้แถวเดียว
);

-- ปฏิกิริยา ยา ↔ ยา
create table drug_drug_interactions (
  id            uuid primary key default gen_random_uuid(),
  drug_a_id     uuid not null references drug_reference(id) on delete cascade,
  drug_b_id     uuid not null references drug_reference(id) on delete cascade,
  severity      severity_level not null,
  mechanism_th  text not null,
  management_th text not null,
  source_note   text,

  -- บังคับให้เก็บคู่ยาเรียงจากน้อยไปมากเสมอ กันข้อมูลซ้ำแบบสลับด้าน
  -- ถ้าไม่มีบรรทัดนี้ (A,B) กับ (B,A) จะกลายเป็นคนละแถวทั้งที่เป็นคู่เดียวกัน
  constraint drug_pair_ordered check (drug_a_id < drug_b_id),
  unique (drug_a_id, drug_b_id)
);


-- ============================================================
--  2. ตารางข้อมูลผู้ใช้
-- ============================================================

create table medications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- อ้างถึงยาในฐานอ้างอิง (null ได้ ถ้าผู้ใช้กรอกยาที่ไม่มีในระบบ)
  drug_id         uuid references drug_reference(id) on delete set null,
  name            text not null,      -- ชื่อที่แสดงในแอป คัดลอกจาก drug_reference ตอนเพิ่ม

  dosage          text not null,
  quantity        int  not null default 0 check (quantity between 0 and 999),
  reminder_times  text[] not null default '{}',   -- ['08:00', '20:00'] รูปแบบ HH:MM
  meal_relation   meal_relation not null default 'independent',

  -- หมวดอาหารที่ควรเลี่ยงของยาตัวนี้ — คัดลอกมาจากตารางอ้างอิงตอนเพิ่มยา
  -- เก็บซ้ำไว้ที่นี่เพื่อให้หน้ารายละเอียดยาแสดงผลได้ทันทีโดยไม่ต้อง join
  food_risk_codes text[] not null default '{}',

  note            text not null default '',
  status          text not null default 'active' check (status in ('active', 'paused')),
  created_at      timestamptz not null default now(),

  -- เวลาที่แก้ไข reminder_times ครั้งล่าสุด
  -- ใช้กันไม่ให้ระบบสร้างประวัติย้อนหลังของเวลาที่เพิ่งเพิ่มเข้ามา
  reminders_updated_at timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, name)              -- กันผู้ใช้เพิ่มยาชื่อซ้ำในบัญชีเดียวกัน
);

-- หมายเหตุ: ฟิลด์ notificationIds ในฝั่งแอปไม่มีคอลัมน์ในตารางนี้โดยตั้งใจ
-- เพราะ id ของ local notification เป็นของเฉพาะเครื่อง ไม่มีความหมายข้ามอุปกรณ์

create table meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  eaten_at   timestamptz not null,
  meal_type  meal_type not null,
  name       text not null default '',      -- ชื่อมื้อแบบพิมพ์อิสระ เช่น 'ข้าวมันไก่'
  food_codes text[] not null default '{}',  -- หมวดอาหารที่ผู้ใช้ติ๊กเลือก
  photo_path text,                          -- path ใน Supabase Storage (null = ไม่ได้ถ่ายรูป)
  note       text not null default '',
  created_at timestamptz not null default now()
);

create table dose_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  medication_id   uuid references medications(id) on delete set null,

  -- เก็บชื่อและขนาดยาซ้ำไว้ เพื่อให้ประวัติยังอ่านรู้เรื่องแม้ผู้ใช้ลบรายการยาไปแล้ว
  medication_name text not null,
  dosage          text not null,

  scheduled_at    timestamptz not null,
  taken_at        timestamptz,
  status          dose_status not null default 'upcoming',
  source          log_source,
  created_at      timestamptz not null default now(),

  unique (user_id, medication_id, scheduled_at)   -- 1 มื้อ มี log ได้แถวเดียว
);

-- บันทึกคำเตือนที่ระบบแสดง ใช้ย้อนดูในหน้าประวัติ
create table interaction_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  meal_id       uuid references meals(id) on delete cascade,
  medication_id uuid references medications(id) on delete cascade,
  kind          text not null check (kind in ('drug_food', 'drug_drug')),
  severity      severity_level not null,
  message_th    text not null,
  created_at    timestamptz not null default now()
);


-- ============================================================
--  Trigger — อัปเดต updated_at ให้อัตโนมัติ
--
--  ถ้าปล่อยให้แอปเป็นคนเซ็ตเอง มักลืมเซ็ตในบาง path
--  แล้ว updated_at จะค้างอยู่ที่ค่าเดิมทั้งที่ข้อมูลเปลี่ยนไปแล้ว
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger medications_set_updated_at
  before update on medications
  for each row execute function set_updated_at();


-- ============================================================
--  Index
-- ============================================================

create index medications_user_status_idx on medications (user_id, status);
create index meals_user_eaten_idx        on meals (user_id, eaten_at desc);
create index dose_logs_user_sched_idx    on dose_logs (user_id, scheduled_at desc);
create index alerts_user_created_idx     on interaction_alerts (user_id, created_at desc);

-- index สำหรับ fuzzy search ชื่อยา ถ้าไม่มีบรรทัดนี้ การค้นหาจะช้ามากเมื่อข้อมูลเยอะ
create index drug_reference_name_trgm_idx on drug_reference using gin (name_en gin_trgm_ops);


-- ============================================================
--  Row Level Security
--
--  หลักการ: ตารางข้อมูลผู้ใช้ต้องเปิด RLS ทุกตาราง ถ้าลืมเปิดแม้ตารางเดียว
--  ข้อมูลตารางนั้นจะถูกอ่านได้จากทุกบัญชี
-- ============================================================

alter table medications        enable row level security;
alter table meals              enable row level security;
alter table dose_logs          enable row level security;
alter table interaction_alerts enable row level security;

-- ผู้ใช้เห็นและแก้ไขได้เฉพาะแถวของตัวเอง
--   using      → คุมการอ่าน (select/update/delete)
--   with check → คุมการเขียน กันไม่ให้แอบใส่ user_id ของคนอื่น
create policy "own medications" on medications
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own meals" on meals
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own dose_logs" on dose_logs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own interaction_alerts" on interaction_alerts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ตารางอ้างอิง: ผู้ใช้ที่ล็อกอินแล้วอ่านได้ทุกคน แต่ไม่มี policy สำหรับเขียน
-- จึงเขียนไม่ได้เลยผ่านแอป (ทีมนำเข้าข้อมูลผ่าน SQL Editor หรือ service role key แทน)
alter table food_categories        enable row level security;
alter table drug_reference         enable row level security;
alter table drug_food_interactions enable row level security;
alter table drug_drug_interactions enable row level security;

create policy "read food_categories"        on food_categories        for select to authenticated using (true);
create policy "read drug_reference"         on drug_reference         for select to authenticated using (true);
create policy "read drug_food_interactions" on drug_food_interactions for select to authenticated using (true);
create policy "read drug_drug_interactions" on drug_drug_interactions for select to authenticated using (true);


-- ============================================================
--  RPC function
--
--  ตั้งใจไม่ใช้ security definer เพราะ function ที่อ่านข้อมูลผู้ใช้
--  ควรถูกกรองด้วย RLS ของผู้เรียกเอง ถ้าใส่ security definer
--  จะข้าม RLS ทั้งหมดและกลายเป็นช่องโหว่ให้เห็นข้อมูลคนอื่น
-- ============================================================

-- ค้นหาชื่อยาแบบใกล้เคียง ใช้ตอนผู้ใช้พิมพ์ชื่อยาในฟอร์ม
create or replace function search_drugs(q text, max_results int default 10)
returns table (id uuid, name_en text, category_th text, score real)
language sql stable
as $$
  select d.id,
         d.name_en,
         d.category_th,
         similarity(d.name_en, q) as score
  from drug_reference d
  where d.name_en % q                    -- คล้ายกันตามเกณฑ์ pg_trgm
     or d.name_en ilike q || '%'         -- หรือขึ้นต้นด้วยคำที่พิมพ์
  order by score desc, d.name_en
  limit max_results;
$$;

-- ตรวจว่ายาที่กำลังจะเพิ่ม ตีกับยาที่ผู้ใช้รับประทานอยู่หรือไม่
-- RLS ของตาราง medications จะกรองให้เห็นเฉพาะยาของผู้เรียกเองโดยอัตโนมัติ
create or replace function check_drug_drug(p_drug_id uuid)
returns table (
  other_name    text,
  severity      severity_level,
  mechanism_th  text,
  management_th text
)
language sql stable
as $$
  select other.name_en,
         ddi.severity,
         ddi.mechanism_th,
         ddi.management_th
  from drug_drug_interactions ddi
  join medications m
    on m.status = 'active'
   and m.drug_id is not null
   and m.drug_id <> p_drug_id
   and m.drug_id in (ddi.drug_a_id, ddi.drug_b_id)
  join drug_reference other
    on other.id = m.drug_id
  where p_drug_id in (ddi.drug_a_id, ddi.drug_b_id)
  order by ddi.severity;
$$;

-- ตรวจว่าหมวดอาหารของมื้อที่กำลังบันทึก ตีกับยาที่ผู้ใช้รับประทานอยู่หรือไม่
create or replace function check_meal_interactions(p_food_codes text[])
returns table (
  medication_name text,
  food_label_th   text,
  severity        severity_level,
  mechanism_th    text,
  management_th   text
)
language sql stable
as $$
  select m.name,
         fc.label_th,
         dfi.severity,
         dfi.mechanism_th,
         dfi.management_th
  from medications m
  join drug_food_interactions dfi on dfi.drug_id = m.drug_id
  join food_categories fc         on fc.code = dfi.food_code
  where m.status = 'active'
    and dfi.food_code = any (p_food_codes)
  order by dfi.severity;
$$;


-- ============================================================
--  ข้อมูลตั้งต้น: หมวดอาหาร
--  (ข้อมูลยาและปฏิกิริยานำเข้าแยกต่างหากจาก DDInter 2.0)
-- ============================================================

insert into food_categories (code, label_th, examples_th, sort_order) values
  ('dairy',       'นม / ผลิตภัณฑ์จากนม',          'นมวัว โยเกิร์ต ชีส',              1),
  ('calcium',     'อาหารเสริมแคลเซียม / ธาตุเหล็ก', 'แคลเซียมเม็ด ยาบำรุงเลือด',        2),
  ('vitamin_k',   'ผักใบเขียวเข้ม (วิตามินเค)',    'คะน้า บรอกโคลี ผักโขม',           3),
  ('citrus',      'ส้ม / เกรปฟรุต',               'น้ำเกรปฟรุต ส้มโอ',               4),
  ('caffeine',    'คาเฟอีน',                     'กาแฟ ชา น้ำอัดลม ชาเขียว',         5),
  ('alcohol',     'แอลกอฮอล์',                   'เบียร์ ไวน์ เหล้า',                6),
  ('fermented',   'อาหารหมักดอง',                'ปลาร้า กิมจิ ชีสบ่ม ถั่วเน่า',       7),
  ('high_fat',    'อาหารไขมันสูง',               'ของทอด กะทิ อาหารมัน',            8),
  ('high_fiber',  'อาหารกากใยสูง',               'ธัญพืชไม่ขัดสี ผักดิบ',            9),
  ('herbal',      'สมุนไพร / อาหารเสริม',         'ขิง กระเทียมสกัด แปะก๊วย',        10);
