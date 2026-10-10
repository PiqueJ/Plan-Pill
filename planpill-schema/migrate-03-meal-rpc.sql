-- ============================================================
--  PlanPill — migration 03: ปรับ RPC ตรวจปฏิกิริยาของมื้ออาหาร
--
--  รันหลัง migrate-02-aliases.sql และ seed ครบแล้ว
--
--  เหตุผล
--    ตอนสร้างครั้งแรกใน schema.sql ยังไม่มีคอลัมน์ description_en / management_en
--    (เพิ่มมาทีหลังใน migrate-01) function จึงคืนแต่ข้อความภาษาไทย
--    ถ้าทีมเพิ่มยาที่ยังไม่ได้แปล แอปจะไม่มีอะไรแสดงให้ผู้ใช้เลย
--    ตอนนี้คืนต้นฉบับอังกฤษมาด้วย ให้แอปเลือกแสดงเองว่าจะใช้อันไหน
--
--    และเพิ่มการกรอง selectable = true ให้ตรงกับที่ฝั่งแอปทำ
--    เพื่อไม่ให้หมวด with_food (เงื่อนไขเวลากินยา ไม่ใช่ชนิดอาหาร)
--    หลุดมาเป็นคำเตือนตอนผู้ใช้บันทึกมื้ออาหาร
-- ============================================================

drop function if exists check_meal_interactions(text[]);

create or replace function check_meal_interactions(p_food_codes text[])
returns table (
  medication_name text,
  food_label_th   text,
  severity        severity_level,
  mechanism_th    text,
  management_th   text,
  description_en  text,
  management_en   text
)
language sql stable
as $$
  select m.name,
         fc.label_th,
         dfi.severity,
         dfi.mechanism_th,
         dfi.management_th,
         dfi.description_en,
         dfi.management_en
  from medications m
  join drug_food_interactions dfi on dfi.drug_id = m.drug_id
  join food_categories fc         on fc.code = dfi.food_code
  where m.status = 'active'
    and fc.selectable = true
    and dfi.food_code = any (p_food_codes)
  order by dfi.severity, m.name;
$$;

comment on function check_meal_interactions(text[]) is
  'ตรวจว่าหมวดอาหารที่ผู้ใช้ติ๊กตอนบันทึกมื้อ ตีกับยาที่ตัวเองรับประทานอยู่หรือไม่ กรองด้วย RLS ของผู้เรียกเอง';
