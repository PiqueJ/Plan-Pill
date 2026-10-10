-- ============================================================
--  PlanPill — migration 02: ตารางชื่อพ้องของยา
--
--  รันหลัง migrate-01-ddinter.sql และ seed ครบทั้ง 3 ไฟล์
--
--  ปัญหาที่แก้
--    DDInter ใช้ชื่อยาแบบอเมริกัน แต่ซองยาในไทยและคนไทยใช้ชื่อ INN หรือชื่อการค้า
--      ฐานข้อมูลมี            คนไทยพิมพ์
--      Acetaminophen          Paracetamol / พาราเซตามอล / พารา / ซาร่า
--      Acetylsalicylic acid   Aspirin / แอสไพริน
--    ถ้าไม่มีตารางนี้ ผู้ใช้ค้นหายาที่ตัวเองกินอยู่ไม่เจอเลย
--    ซึ่งทำให้ฟีเจอร์ตรวจปฏิกิริยาใช้งานไม่ได้จริง
-- ============================================================

-- ---------- 1. ตารางชื่อพ้อง ----------

create table if not exists drug_aliases (
  id         uuid primary key default gen_random_uuid(),
  drug_id    uuid not null references drug_reference(id) on delete cascade,
  alias      text not null,
  -- inn    = ชื่อสามัญสากลที่ใช้บนซองยาไทย เช่น Paracetamol
  -- thai   = คำอ่านภาษาไทย เช่น พาราเซตามอล
  -- brand  = ชื่อการค้าที่พบบ่อยในไทย เช่น ซาร่า
  -- abbrev = คำย่อที่คนเรียกกันติดปาก เช่น พารา, CPM
  alias_type text not null check (alias_type in ('inn', 'thai', 'brand', 'abbrev')),
  unique (drug_id, alias)
);

-- ค้นหาชื่อพ้องแบบใกล้เคียงต้องมี index นี้ ไม่งั้นช้ามากเมื่อข้อมูลเยอะ
create index if not exists drug_aliases_alias_trgm_idx
  on drug_aliases using gin (alias gin_trgm_ops);

alter table drug_aliases enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน แต่ไม่มี policy สำหรับเขียน (ทีมนำเข้าผ่าน SQL Editor เท่านั้น)
drop policy if exists "read drug_aliases" on drug_aliases;
create policy "read drug_aliases" on drug_aliases
  for select to authenticated using (true);

-- ---------- 2. อัปเดต RPC ให้ค้นชื่อพ้องด้วย ----------

drop function if exists search_drugs(text, int);

create or replace function search_drugs(q text, max_results int default 10)
returns table (
  id          uuid,
  name_en     text,
  category_th text,
  -- คำที่ทำให้เจอ ใช้แสดงให้ผู้ใช้เห็นว่า "พาราเซตามอล" ตรงกับ "Acetaminophen"
  matched_via text,
  score       real
)
language sql stable
as $$
  with candidates as (
    -- ค้นจากชื่อหลักในฐานข้อมูล
    select d.id, d.name_en, d.category_th,
           d.name_en as matched_via,
           similarity(d.name_en, q) as score
    from drug_reference d
    where d.name_en % q or d.name_en ilike q || '%'

    union all

    -- ค้นจากชื่อพ้อง แล้วคืนชื่อหลักกลับไป
    select d.id, d.name_en, d.category_th,
           a.alias as matched_via,
           -- บวกคะแนนให้เล็กน้อยเมื่อขึ้นต้นตรงกัน เพราะคนไทยมักพิมพ์แค่ต้นคำ เช่น "พารา"
           --
           -- ต้อง cast เป็น real ให้ครบทุกทาง เพราะ similarity() คืน real
           -- แต่ตัวเลขที่เขียนตรง ๆ เป็น numeric ถ้าไม่ cast ผลรวมจะกลายเป็น numeric
           -- แล้ว Postgres จะปฏิเสธเพราะไม่ตรงกับชนิดที่ประกาศว่า returns ... score real
           greatest(similarity(a.alias, q),
                    case when a.alias ilike q || '%' then 0.75::real else 0::real end) as score
    from drug_aliases a
    join drug_reference d on d.id = a.drug_id
    where a.alias % q or a.alias ilike q || '%'
  ),
  best as (
    -- ยา 1 ตัวอาจตรงหลายทาง เก็บเฉพาะทางที่คะแนนสูงสุด
    select distinct on (c.id)
      c.id, c.name_en, c.category_th, c.matched_via, c.score
    from candidates c
    order by c.id, c.score desc
  )
  select b.id, b.name_en, b.category_th, b.matched_via, b.score
  from best b
  order by b.score desc, b.name_en
  limit max_results;
$$;

-- ---------- 3. หมวดยาภาษาไทย สำหรับแสดงคู่กับชื่อยา ----------

update drug_reference set category_th = v.category_th
from (values
  ('Acetaminophen',        'ยาแก้ปวด / ลดไข้'),
  ('Acetylsalicylic acid', 'ยาแก้ปวด / ต้านการแข็งตัวของเลือด'),
  ('Ibuprofen',            'ยาแก้ปวด / ต้านการอักเสบ'),
  ('Naproxen',             'ยาแก้ปวด / ต้านการอักเสบ'),
  ('Diclofenac',           'ยาแก้ปวด / ต้านการอักเสบ'),
  ('Mefenamic acid',       'ยาแก้ปวด / ปวดประจำเดือน'),
  ('Tramadol',             'ยาแก้ปวดชนิดแรง'),
  ('Cetirizine',           'ยาแก้แพ้'),
  ('Loratadine',           'ยาแก้แพ้'),
  ('Chlorpheniramine',     'ยาแก้แพ้'),
  ('Dextromethorphan',     'ยาแก้ไอ'),
  ('Esomeprazole',         'ยาลดกรดในกระเพาะ'),
  ('Loperamide',           'ยาแก้ท้องเสีย'),
  ('Metoclopramide',       'ยาแก้คลื่นไส้อาเจียน'),
  ('Metformin',            'ยาเบาหวาน'),
  ('Simvastatin',          'ยาลดไขมันในเลือด'),
  ('Atorvastatin',         'ยาลดไขมันในเลือด'),
  ('Warfarin',             'ยาต้านการแข็งตัวของเลือด'),
  ('Levothyroxine',        'ฮอร์โมนไทรอยด์'),
  ('Levonorgestrel',       'ยาคุมกำเนิด'),
  ('Doxycycline',          'ยาปฏิชีวนะ'),
  ('Calcium carbonate',    'แคลเซียมเสริม'),
  ('Iron',                 'ธาตุเหล็กเสริม'),
  ('Folic acid',           'วิตามินเสริม (โฟเลต)'),
  ('Caffeine',             'สารกระตุ้น')
) as v(name_en, category_th)
where drug_reference.name_en = v.name_en;

-- ---------- 4. ชื่อพ้อง ----------
--
--  ชื่อการค้าใส่ไว้เพื่อให้ค้นหาเจอเท่านั้น ระบบไม่ได้แนะนำยี่ห้อใด
--  และไม่ได้ยืนยันว่าผลิตภัณฑ์นั้นมีตัวยาตามที่ระบุในทุกสูตร
--  ผู้ใช้ควรตรวจชื่อตัวยาสำคัญบนซองยาอีกครั้ง

insert into drug_aliases (drug_id, alias, alias_type)
select d.id, v.alias, v.alias_type
from (values
  -- Acetaminophen (ในไทยเรียก Paracetamol)
  ('Acetaminophen', 'Paracetamol',          'inn'),
  ('Acetaminophen', 'พาราเซตามอล',           'thai'),
  ('Acetaminophen', 'พารา',                  'abbrev'),
  ('Acetaminophen', 'ยาแก้ปวดลดไข้',          'abbrev'),
  ('Acetaminophen', 'ซาร่า',                 'brand'),
  ('Acetaminophen', 'พานาดอล',               'brand'),
  ('Acetaminophen', 'Panadol',              'brand'),
  ('Acetaminophen', 'Tylenol',              'brand'),
  ('Acetaminophen', 'Sara',                 'brand'),

  -- Acetylsalicylic acid (ในไทยเรียก Aspirin)
  ('Acetylsalicylic acid', 'Aspirin',       'inn'),
  ('Acetylsalicylic acid', 'แอสไพริน',       'thai'),
  ('Acetylsalicylic acid', 'ASA',           'abbrev'),

  ('Ibuprofen', 'ไอบูโพรเฟน',                'thai'),
  ('Ibuprofen', 'Brufen',                   'brand'),
  ('Ibuprofen', 'บรูเฟน',                    'brand'),
  ('Ibuprofen', 'Nurofen',                  'brand'),

  ('Naproxen',  'นาพรอกเซน',                 'thai'),
  ('Diclofenac','ไดโคลฟีแนค',                'thai'),
  ('Diclofenac','Voltaren',                 'brand'),
  ('Diclofenac','โวลทาเรน',                  'brand'),

  ('Mefenamic acid', 'กรดเมเฟนามิก',          'thai'),
  ('Mefenamic acid', 'Ponstan',             'brand'),
  ('Mefenamic acid', 'พอนสแตน',              'brand'),

  ('Tramadol', 'ทรามาดอล',                   'thai'),

  ('Cetirizine', 'เซทิริซีน',                 'thai'),
  ('Cetirizine', 'Zyrtec',                  'brand'),
  ('Cetirizine', 'เซอร์เทค',                  'brand'),

  ('Loratadine', 'ลอราทาดีน',                'thai'),
  ('Loratadine', 'Clarityne',               'brand'),
  ('Loratadine', 'คลาริทีน',                 'brand'),

  ('Chlorpheniramine', 'Chlorphenamine',    'inn'),
  ('Chlorpheniramine', 'คลอร์เฟนิรามีน',      'thai'),
  ('Chlorpheniramine', 'CPM',               'abbrev'),
  ('Chlorpheniramine', 'ยาแก้แพ้เม็ดเหลือง',   'abbrev'),

  ('Dextromethorphan', 'เดกซ์โทรเมทอร์แฟน',   'thai'),
  ('Dextromethorphan', 'DM',                'abbrev'),

  ('Esomeprazole', 'เอโซเมพราโซล',           'thai'),
  ('Esomeprazole', 'Nexium',                'brand'),
  ('Esomeprazole', 'เน็กเซียม',              'brand'),

  ('Loperamide', 'โลเพอราไมด์',              'thai'),
  ('Loperamide', 'Imodium',                 'brand'),
  ('Loperamide', 'อิโมเดียม',                'brand'),

  ('Metoclopramide', 'เมโทโคลพราไมด์',        'thai'),
  ('Metoclopramide', 'Plasil',              'brand'),

  ('Metformin', 'เมทฟอร์มิน',                'thai'),
  ('Metformin', 'Glucophage',               'brand'),
  ('Metformin', 'กลูโคฟาจ',                  'brand'),

  ('Simvastatin',  'ซิมวาสแตติน',            'thai'),
  ('Simvastatin',  'Zocor',                 'brand'),
  ('Atorvastatin', 'อะทอร์วาสแตติน',          'thai'),
  ('Atorvastatin', 'Lipitor',               'brand'),
  ('Atorvastatin', 'ลิพิทอร์',                'brand'),

  ('Warfarin', 'วาร์ฟาริน',                  'thai'),
  ('Warfarin', 'Orfarin',                   'brand'),
  ('Warfarin', 'ออร์ฟาริน',                  'brand'),

  ('Levothyroxine', 'เลโวไทรอกซีน',          'thai'),
  ('Levothyroxine', 'Eltroxin',             'brand'),
  ('Levothyroxine', 'เอลทรอกซิน',            'brand'),
  ('Levothyroxine', 'ยาไทรอยด์',             'abbrev'),

  ('Levonorgestrel', 'ลีโวนอร์เจสเทรล',       'thai'),
  ('Levonorgestrel', 'ยาคุมฉุกเฉิน',          'abbrev'),
  ('Levonorgestrel', 'Postinor',            'brand'),

  ('Doxycycline', 'ด็อกซีไซคลิน',            'thai'),

  ('Calcium carbonate', 'แคลเซียมคาร์บอเนต',  'thai'),
  ('Calcium carbonate', 'แคลเซียม',          'abbrev'),

  ('Iron', 'ธาตุเหล็ก',                      'thai'),
  ('Iron', 'ยาบำรุงเลือด',                   'abbrev'),

  ('Folic acid', 'กรดโฟลิก',                 'thai'),
  ('Folic acid', 'โฟลิก',                    'abbrev'),
  ('Folic acid', 'วิตามินบี 9',              'abbrev'),

  ('Caffeine', 'คาเฟอีน',                    'thai')
) as v(drug_name, alias, alias_type)
join drug_reference d on d.name_en = v.drug_name
on conflict (drug_id, alias) do nothing;

comment on table drug_aliases is
  'ชื่อพ้องของยา ใช้ให้ผู้ใช้ค้นหาด้วยชื่อที่คุ้นเคยแล้วเจอชื่อมาตรฐานในฐานข้อมูล ชื่อการค้าใส่ไว้เพื่อการค้นหาเท่านั้น ไม่ใช่การแนะนำผลิตภัณฑ์';
