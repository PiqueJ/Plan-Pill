-- ============================================================
--  PlanPill — ตรวจว่านำเข้าข้อมูลครบหรือยัง
--  รันไฟล์นี้ใน SQL Editor เป็นขั้นสุดท้าย หลังรัน migration และ seed ครบทุกไฟล์
-- ============================================================

select 'food_categories'         as ตาราง, count(*) as จำนวนแถว, '17'    as ควรได้ from food_categories
union all
select 'drug_reference',              count(*), '61'    from drug_reference
union all
select 'drug_food_interactions',      count(*), '81'    from drug_food_interactions
union all
select 'drug_drug_interactions',      count(*), '405'   from drug_drug_interactions;

-- สัดส่วนที่แปลไทยแล้ว (ควรได้ 100% เพราะคัดเฉพาะยาที่แปลครบแล้ว)
select
  count(*)                                          as ทั้งหมด,
  count(mechanism_th)                               as แปลไทยแล้ว,
  round(count(mechanism_th) * 100.0 / count(*))     as เปอร์เซ็นต์
from drug_food_interactions;

-- คู่ที่จะใช้สาธิต ต้องขึ้นครบทุกแถวและมีคำแปลไทย
select
  d.name_en                as ยา,
  f.label_th               as หมวดอาหาร,
  i.severity               as ระดับ,
  (i.mechanism_th is not null) as มีคำแปลไทย
from drug_food_interactions i
join drug_reference d  on d.id = i.drug_id
join food_categories f on f.code = i.food_code
where (d.name_en, f.code) in (
  ('Simvastatin',   'grapefruit'),
  ('Acetaminophen', 'alcohol'),
  ('Metformin',     'alcohol'),
  ('Warfarin',      'vitamin_k'),
  ('Levothyroxine', 'soy')
)
order by i.severity, d.name_en;

-- ทดสอบ RPC ค้นหาชื่อยา (ควรเจอ Acetaminophen แม้พิมพ์ผิดเล็กน้อย)
select * from search_drugs('acetaminophe', 5);


-- ============================================================
--  ส่วนนี้ใช้ได้หลังรัน migrate-02-aliases.sql แล้วเท่านั้น
-- ============================================================

select 'drug_aliases' as ตาราง, count(*) as จำนวนแถว, '71' as ควรได้ from drug_aliases;

-- คำที่คนไทยพิมพ์จริง ต้องหาเจอทุกคำ
select 'paracetamol'   as คำค้น, * from search_drugs('paracetamol', 2)
union all select 'พารา',          * from search_drugs('พารา', 2)
union all select 'พาราเซตามอล',   * from search_drugs('พาราเซตามอล', 2)
union all select 'ซาร่า',         * from search_drugs('ซาร่า', 2)
union all select 'aspirin',       * from search_drugs('aspirin', 2)
union all select 'ยาแก้แพ้เม็ดเหลือง', * from search_drugs('ยาแก้แพ้เม็ดเหลือง', 2)
union all select 'ลิพิทอร์',       * from search_drugs('ลิพิทอร์', 2)
union all select 'ยาคุมฉุกเฉิน',   * from search_drugs('ยาคุมฉุกเฉิน', 2);

-- หมวดยาภาษาไทย ควรขึ้นครบ 25 ตัว
select count(*) as ยาที่มีหมวดภาษาไทย from drug_reference where category_th is not null;

-- คู่ยาที่ตีกัน ต้องเจอ Warfarin + Ibuprofen ระดับ major
select a.name_en as ยา_ก, b.name_en as ยา_ข, i.severity as ระดับ
from drug_drug_interactions i
join drug_reference a on a.id = i.drug_a_id
join drug_reference b on b.id = i.drug_b_id
where 'Warfarin' in (a.name_en, b.name_en)
order by i.severity, a.name_en
limit 10;


-- ============================================================
--  ตรวจว่ารัน migrate-04 และ migrate-05 แล้ว
--  ทุกแถวต้องได้ true ถ้าได้ false ให้กลับไปรันไฟล์ที่ระบุ
-- ============================================================

select 'migrate-04: bucket meal-photos' as ตรวจ,
       exists (select 1 from storage.buckets where id = 'meal-photos') as ผ่าน
union all
select 'migrate-05: ตาราง user_settings',
       to_regclass('public.user_settings') is not null
union all
select 'migrate-05: เปิด RLS ของ user_settings',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.user_settings')), false)
union all
select 'migrate-05: trigger กันประวัติที่ล้างแล้ว',
       exists (select 1 from pg_trigger where tgname = 'dose_logs_skip_cleared' and not tgisinternal);
