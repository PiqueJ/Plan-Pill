-- ============================================================
--  PlanPill — seed 04: หมวดยาภาษาไทย และชื่อพ้องของยา
--
--  แยกออกมาจาก migrate-02-aliases.sql เพราะส่วนนี้ยังไม่เข้าฐานข้อมูล
--  รันไฟล์นี้ได้เลย ปลอดภัยถ้ารันซ้ำ (update เขียนทับ, insert มี on conflict)
--
--  ถ้าขึ้น error ให้ส่งข้อความ error มาทั้งบรรทัด
-- ============================================================

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
