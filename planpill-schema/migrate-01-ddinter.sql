-- ============================================================
--  PlanPill — migration 01: ปรับ schema ให้รองรับข้อมูลจริงจาก DDInter
--
--  รันไฟล์นี้ใน Supabase SQL Editor "หลัง" schema.sql
--
--  เหตุผลที่ต้องแก้ หลังจากได้ข้อมูลจริงมาตรวจแล้ว
--    1. ไฟล์ drug-drug ของ DDInter มีแค่คู่ยากับระดับความรุนแรง ไม่มีคำอธิบายเลย
--       คอลัมน์ mechanism_th / management_th จึงเป็น NOT NULL ไม่ได้
--    2. ข้อความต้นฉบับเป็นภาษาอังกฤษ ควรเก็บไว้ด้วยเพื่อตรวจสอบย้อนกลับได้
--       แล้วค่อยเติมคำแปลไทยทีหลัง (ตอนนี้แปลได้บางส่วน)
--    3. หมวดอาหารที่ตั้งไว้ตอนแรกเดาเอาเอง ไม่ตรงกับชื่ออาหารจริงในข้อมูล
--       จึงแทนที่ด้วยหมวดที่สร้างจากชื่ออาหารจริงทั้ง 29 ชื่อ
-- ============================================================

-- ---------- 1. ข้อความอธิบายให้ว่างได้ และเก็บต้นฉบับภาษาอังกฤษ ----------

alter table drug_food_interactions
  alter column mechanism_th  drop not null,
  alter column management_th drop not null;

alter table drug_food_interactions
  add column if not exists description_en text,
  add column if not exists management_en  text,
  -- ประเภทกลไกจาก DDInter เช่น Absorption, Metabolism, Synergy
  add column if not exists mechanism_type  text,
  -- ชื่ออาหารต้นฉบับ เช่น "grapefruit juice" เก็บไว้อ้างอิงนอกเหนือจากหมวด
  add column if not exists food_name_en    text;

alter table drug_drug_interactions
  alter column mechanism_th  drop not null,
  alter column management_th drop not null;

-- ---------- 2. หมวดอาหาร: ใช้ชุดที่สร้างจากข้อมูลจริง ----------

-- selectable = ผู้ใช้ติ๊กเลือกได้ตอนบันทึกมื้ออาหารหรือไม่
--   false สำหรับ "รับประทานพร้อมอาหาร" (เป็นเงื่อนไขการกินยา ไม่ใช่ชนิดอาหาร)
--   และ "บุหรี่" (ไม่ใช่อาหาร แต่ DDInter รวมไว้ในชุดนี้)
alter table food_categories
  add column if not exists selectable boolean not null default true;

-- ลบของเดิมที่ตั้งไว้ก่อนเห็นข้อมูลจริง
-- ลบ interaction ที่อ้างถึงด้วย เพราะ food_code เปลี่ยนชุดใหม่ทั้งหมด
delete from drug_food_interactions;
delete from food_categories;

insert into food_categories (code, label_th, examples_th, sort_order, selectable) values
  ('alcohol',      'แอลกอฮอล์',                'เบียร์ ไวน์ เหล้า',                        1,  true),
  ('grapefruit',   'เกรปฟรุต',                 'น้ำเกรปฟรุต ส้มโอฝรั่ง',                    2,  true),
  ('citrus',       'ส้มและผลไม้รสเปรี้ยว',      'น้ำส้ม ส้ม ทับทิม แครนเบอร์รี',             3,  true),
  ('dairy',        'นมและผลิตภัณฑ์จากนม',       'นมวัว โยเกิร์ต ชีส',                       4,  true),
  ('caffeine',     'คาเฟอีน',                  'กาแฟ ชาเขียว โคล่า น้ำอัดลม',              5,  true),
  ('high_fat',     'อาหารไขมันสูง',            'ของทอด อาหารมัน กะทิ',                    6,  true),
  ('high_fiber',   'อาหารกากใยสูง',            'รำข้าว ธัญพืชไม่ขัดสี ซีเรียล',             7,  true),
  ('oxalate',      'ผักที่มีกรดออกซาลิกสูง',    'ผักโขม รูบาร์บ',                          8,  true),
  ('potassium',    'อาหารโพแทสเซียมสูง',        'กล้วย ส้ม มันฝรั่ง เกลือโพแทสเซียม',        9,  true),
  ('vitamin_k',    'อาหารที่มีวิตามินเคสูง',    'คะน้า บรอกโคลี ผักใบเขียวเข้ม',            10, true),
  ('tyrosine',     'อาหารที่มีไทโรซีนสูง',      'ชีสบ่ม ถั่ว เนื้อหมัก',                    11, true),
  ('soy',          'ถั่วเหลือง',               'เต้าหู้ นมถั่วเหลือง',                     12, true),
  ('nuts_seeds',   'ถั่วเปลือกแข็งและเมล็ดพืช',  'วอลนัต เมล็ดฝ้าย',                        13, true),
  ('iodine',       'อาหารที่มีไอโอดีนสูง',      'สาหร่าย อาหารทะเล เกลือเสริมไอโอดีน',       14, true),
  ('photosensitive', 'อาหารที่ทำให้ไวต่อแสง',   'ผักชีฝรั่ง มะนาว มะเดื่อ',                 15, true),
  -- สองหมวดนี้ไม่ให้ติ๊กในไดอารี่มื้ออาหาร แต่ยังแสดงเป็นข้อควรระวังของยาได้
  ('with_food',    'การรับประทานพร้อมอาหาร',    'เงื่อนไขว่าควรกินยาพร้อมอาหารหรือไม่',      16, false),
  ('smoking',      'การสูบบุหรี่',              'บุหรี่ (ไม่ใช่อาหาร แต่มีผลต่อยา)',         17, false);

-- ---------- 3. กัน food_code ที่ไม่มีในตารางหลุดเข้ามา ----------

-- unique (drug_id, food_code) ของเดิมยังใช้ได้
-- สคริปต์ build-seed.py จะรวมอาหารหลายชื่อที่อยู่หมวดเดียวกันให้เหลือแถวเดียว
-- โดยเลือกระดับความรุนแรงที่สูงที่สุดไว้

comment on column drug_food_interactions.description_en is
  'ข้อความต้นฉบับจาก DDInter 2.0 ถูกตัดที่ประมาณ 200 ตัวอักษรตั้งแต่ต้นทาง';
comment on column drug_food_interactions.mechanism_th is
  'คำแปลไทย อาจเป็น null ถ้ายังแปลไม่ถึง ให้แอปแสดง description_en แทน';
