-- ============================================================
--  PlanPill — ชุดข้อมูลเดโมสำหรับนำเสนอ
--
--  วิธีใช้
--    1. สมัครบัญชีใหม่ในแอปก่อน (ปุ่ม "สมัครใหม่" ในหน้าเข้าสู่ระบบ)
--       แนะนำ demo@planpill.dev เพื่อไม่ปนกับบัญชีที่ใช้พัฒนา
--    2. แก้ค่า v_email ด้านล่างให้ตรงกับอีเมลที่สมัคร
--    3. รันทั้งไฟล์ใน Supabase SQL Editor
--    4. เข้าแอปด้วยบัญชีนั้น ข้อมูลจะขึ้นครบทันที
--
--  รันซ้ำได้ ทุกครั้งจะล้างข้อมูลเดิมของบัญชีนี้แล้วใส่ชุดใหม่
--  ควรรันใหม่ก่อนขึ้นนำเสนอทุกครั้ง เพราะวันที่ทั้งหมดนับจาก "วันที่รัน"
--  ถ้ารันไว้นานแล้ว วันหลัง ๆ จะว่าง แล้วแอปจะปิดรอบให้เป็น "ไม่ได้บันทึก" ทั้งหมด
--
--  สำคัญ: สคริปต์นี้แตะเฉพาะบัญชีที่ระบุใน v_email เท่านั้น บัญชีอื่นไม่ถูกกระทบ
--
--  ข้อมูลปฏิกิริยาทั้งหมดอ่านจากตารางจริงในฐานข้อมูล ไม่ได้พิมพ์ทับเอง
--  ที่แสดงตอนนำเสนอจึงเป็นผลจากข้อมูล DDInter 2.0 จริง ๆ
--
--  เรื่องที่ชุดนี้เล่า
--    พนักงานออฟฟิศที่กินยาประจำ 5 ตัวมา 30 วัน ส่วนใหญ่กินตรงเวลา (ประมาณ 85%)
--    มีช้าบ้าง ลืมบ้างเหมือนคนจริง กินข้าวปกติเกือบทุกมื้อโดยไม่มีปัญหากับยา
--    แล้ว 1-3 วันหลังนี้ได้ยาปฏิชีวนะจากคลินิก และซื้อยาแก้ปวดกับยาแก้ไอมากินเอง
--    โดยไม่รู้ว่าตีกับยาเดิม คำเตือนอันตรายจึงเพิ่งโผล่มาไม่กี่วันนี้
--
--  สิ่งที่จะได้เห็นในแอป
--    วันนี้      มื้อที่ผ่านไปแล้วบันทึกครบ มื้อใน 30 นาทีล่าสุดขึ้นเป็น "ถึงเวลาแล้ว"
--    ประวัติ     30 วัน ตรงเวลา / ช้ากว่านัด / ไม่ได้บันทึก / ข้ามมื้อ ครบทุกแบบ
--                เมื่อวานลืมยาแก้ไอก่อนนอน 1 มื้อ ยังกด "บันทึกย้อนหลัง" ได้ (ภายใน 24 ชม.)
--    ไดอารี่     มื้ออาหาร 14 วัน ส่วนใหญ่ปกติ มีคำเตือนแทรกเป็นระยะ
--
--  เรื่องโซนเวลา
--    ทุกเวลาระบุ at time zone 'Asia/Bangkok' อย่างชัดเจน
--    ถ้าปล่อยให้ Postgres เดาเอง มันจะตีความเป็นโซนของ session (ปกติคือ UTC)
--    มื้อ 07:30 จะไปโผล่ในแอปเป็น 14:30 และประวัติการกินยาจะไม่ตรงกับตารางที่แอปสร้าง
-- ============================================================

do $$
declare
  -- ↓↓↓ แก้เป็นอีเมลของบัญชีเดโมที่สมัครไว้ ↓↓↓
  v_email text := 'demo@planpill.dev';

  v_user  uuid;
  -- วันที่ตามเวลาไทย ไม่ใช่ตามโซนของ session
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select id into v_user from auth.users where email = v_email;

  if v_user is null then
    raise exception
      'ไม่พบบัญชี % — ต้องสมัครในแอปก่อน แล้วค่อยรันสคริปต์นี้', v_email;
  end if;

  -- ล้างของเดิมของบัญชีนี้ ให้รันซ้ำได้โดยข้อมูลไม่ทับซ้อน
  delete from interaction_alerts where user_id = v_user;
  delete from dose_logs          where user_id = v_user;
  delete from meals              where user_id = v_user;
  delete from medications        where user_id = v_user;

  -- ถ้าบัญชีนี้เคยกด "ล้างประวัติ" ในแอป trigger ของ migrate-05 จะกรองประวัติ
  -- "ไม่ได้บันทึก" (source = auto) ที่ใส่ด้านล่างทิ้งทั้งหมด จึงต้องล้างเวลานั้นก่อน
  -- ใช้ execute เพื่อให้ไฟล์นี้ยังรันได้ ถ้ายังไม่ได้รัน migrate-05
  if to_regclass('public.user_settings') is not null then
    execute 'delete from user_settings where user_id = $1' using v_user;
  end if;

  -- ---------------------------------------------------------
  --  ยาที่ผู้ใช้รับประทานอยู่
  --
  --  food_risk_codes คำนวณจากตารางอ้างอิงจริง เหมือนที่แอปทำตอนเพิ่มยา
  --  (กรอง selectable = true เพื่อตัดหมวดที่ไม่ใช่ชนิดอาหารออก)
  --
  --  days_ago = เพิ่มยานี้เมื่อกี่วันก่อน (นับเป็น 07:00 ของวันนั้น) มีผลสองอย่าง
  --    1. เล่าเรื่องว่ายาตัวไหนเป็นยาประจำ ตัวไหนเพิ่งซื้อมากินเอง
  --    2. คุมว่าประวัติการกินยาย้อนหลังได้ไกลแค่ไหน (ดูส่วน dose_logs)
  -- ---------------------------------------------------------
  insert into medications (
    user_id, drug_id, name, dosage, quantity,
    reminder_times, meal_relation, food_risk_codes, note, status,
    created_at, reminders_updated_at, updated_at
  )
  select
    v_user,
    d.id,
    d.name_en,
    v.dosage,
    v.quantity,
    v.times,
    v.relation::meal_relation,
    coalesce(
      (
        select array_agg(distinct dfi.food_code)
        from drug_food_interactions dfi
        join food_categories fc on fc.code = dfi.food_code
        where dfi.drug_id = d.id
          and fc.selectable = true
      ),
      '{}'::text[]
    ),
    v.note,
    'active',
    -- เริ่มใช้ยาตอน 07:00 ของวันนั้นเสมอ ไม่ใช่ "เวลาที่รันสคริปต์"
    -- ไม่งั้นถ้ารันตอนดึก มื้อ 21:00 ของวันแรกจะหลุดไปเพราะเกิดก่อนเวลาเพิ่มยา
    ((v_today - v.days_ago) + time '07:00') at time zone 'Asia/Bangkok',
    ((v_today - v.days_ago) + time '07:00') at time zone 'Asia/Bangkok',
    ((v_today - v.days_ago) + time '07:00') at time zone 'Asia/Bangkok'
  from (values
    -- ยาประจำ กินมา 30 วันแล้ว
    ('Warfarin',         '1 เม็ด',   24, array['18:00'],          'after_meal',  30, 'ยาต้านการแข็งตัวของเลือด หมอนัดเจาะเลือดดู INR ทุกเดือน'),
    ('Simvastatin',      '1 เม็ด',   45, array['20:00'],          'after_meal',  30, 'ลดไขมันในเลือด'),
    ('Metformin',        '1 เม็ด',   50, array['08:00','18:00'],  'with_meal',   30, 'เบาหวาน กินพร้อมอาหารกันคลื่นไส้'),
    ('Sertraline',       '1 เม็ด',   26, array['08:00'],          'after_meal',  30, 'หมอสั่ง ห้ามหยุดเอง'),
    ('Levothyroxine',    '1 เม็ด',   40, array['06:30'],          'before_meal', 30, 'ไทรอยด์ ต้องกินตอนท้องว่าง'),
    -- ยาที่เพิ่งได้มาจากคลินิก
    ('Ciprofloxacin',    '1 เม็ด',    6, array['09:00','21:00'],  'after_meal',   3, 'ยาปฏิชีวนะ คอร์ส 5 วัน กินให้หมด'),
    -- ยาที่ซื้อกินเอง ← ต้นเหตุของคำเตือนระดับอันตราย
    ('Ibuprofen',        '1 เม็ด',   18, array['13:00'],          'after_meal',   2, 'ซื้อมากินเองตอนปวดหลัง'),
    ('Dextromethorphan', '1 ช้อนชา', 14, array['21:00'],          'independent',  1, 'ยาแก้ไอที่ซื้อจากร้านขายยา')
  ) as v(drug_name, dosage, quantity, times, relation, days_ago, note)
  join drug_reference d on d.name_en = v.drug_name;

  -- ---------------------------------------------------------
  --  ประวัติการรับประทานยาย้อนหลัง 30 วัน
  --
  --  ต้องสร้างเวลาให้ตรงกับที่แอปคำนวณเองเป๊ะ ๆ
  --  แอปเอา reminder_times มาประกอบกับวันที่ตามเวลาเครื่อง (ไทย)
  --  ถ้าเวลาคลาดกันแม้แต่ชั่วโมงเดียว แอปจะถือว่าเป็นคนละมื้อ
  --  แล้วสร้างรายการ "ไม่ได้บันทึก" ซ้อนขึ้นมาอีกชุด
  --
  --  เงื่อนไข
  --    scheduled_at < now() - 30 นาที       → มื้อใน 30 นาทีล่าสุดปล่อยว่างไว้
  --                                          แอปจะขึ้นเป็นการ์ด "ถึงเวลาแล้ว" ให้กดตอนนำเสนอ
  --                                          (ไม่ปล่อยนานกว่านี้ เพราะเลย 2 ชม. แอปจะปิดรอบเป็น "ไม่ได้บันทึก")
  --    scheduled_at >= reminders_updated_at → ไม่สร้างประวัติย้อนหลังก่อนวันที่เพิ่มยา
  --                                          (กฎเดียวกับที่แอปใช้)
  --
  --  สัดส่วน กำหนดตายตัวจากเลขวัน เลขชั่วโมง และความยาวชื่อยา ไม่สุ่ม
  --  ซ้อมนำเสนอกี่รอบก็ได้ข้อมูลชุดเดิม
  --    k = 0        ไม่ได้บันทึก    ~5%   ระบบปิดรอบให้เอง
  --    k = 1, 2     ช้ากว่านัด      ~10%  ยืนยันช้า 40-115 นาที
  --    3 มื้อ       ข้ามมื้อ              ผู้ใช้กดข้ามเอง
  --    ที่เหลือ      ตรงเวลา        ~85%  ยืนยันก่อนเวลา 5 นาที ถึงหลังเวลา 12 นาที
  --    วันนี้       มื้อที่ผ่านไปแล้วกินตรงเวลาทุกมื้อ
  --    เมื่อวาน     ครบเกือบทุกมื้อ Metformin เย็นช้าไป 55 นาที
  --                ลืมยาแก้ไอก่อนนอน 1 มื้อ ← ใช้สาธิตปุ่ม "บันทึกย้อนหลัง"
  -- ---------------------------------------------------------
  insert into dose_logs (
    user_id, medication_id, medication_name, dosage,
    scheduled_at, taken_at, status, source, created_at
  )
  select
    v_user,
    m.id,
    m.name,
    m.dosage,
    slot.at,
    case
      when plan.outcome = 'taken'
      then slot.at + make_interval(mins => plan.delay_minutes)
    end,
    plan.outcome::dose_status,
    -- missed ระบบเป็นคนปิดรอบให้เอง ส่วน taken กับ skipped ผู้ใช้กดเอง
    case when plan.outcome = 'missed' then 'auto' else 'manual' end::log_source,
    slot.at
  from medications m
  cross join lateral unnest(m.reminder_times) as rt(slot_time)
  cross join generate_series(0, 29) as d(days_ago)
  cross join lateral (
    select ((v_today - d.days_ago) + rt.slot_time::time)
             at time zone 'Asia/Bangkok' as at
  ) slot
  cross join lateral (
    select
      substring(rt.slot_time, 1, 2)::int as hh,
      (d.days_ago * 7 + substring(rt.slot_time, 1, 2)::int * 3 + length(m.name)) % 20 as k
  ) h
  cross join lateral (
    select
      case
        when d.days_ago = 0 then 'taken'
        when d.days_ago = 1 and m.name = 'Dextromethorphan' then 'missed'
        when d.days_ago = 1 then 'taken'
        when (d.days_ago = 5  and m.name = 'Simvastatin')
          or (d.days_ago = 13 and m.name = 'Sertraline')
          or (d.days_ago = 22 and m.name = 'Warfarin') then 'skipped'
        when h.k = 0 then 'missed'
        else 'taken'
      end as outcome,
      case
        when d.days_ago = 1 and m.name = 'Metformin' and rt.slot_time = '18:00' then 55
        -- ช้ากว่า 30 นาที = "ช้ากว่านัด" ในหน้าประวัติ
        when d.days_ago >= 2 and h.k in (1, 2) then 40 + ((d.days_ago * 11 + h.hh) % 6) * 15
        -- ตรงเวลา: กดก่อนเวลาได้นิดหน่อย (แอปให้กดล่วงหน้าได้ 30 นาที) หรือช้าไม่เกิน 12 นาที
        else ((d.days_ago * 5 + h.hh + length(m.name)) % 18) - 5
      end as delay_minutes
  ) plan
  where m.user_id = v_user
    and slot.at < now() - interval '30 minutes'
    and slot.at >= m.reminders_updated_at;

  -- ---------------------------------------------------------
  --  มื้ออาหารย้อนหลัง 14 วัน
  --
  --  มื้อปกติใช้เฉพาะหมวดที่ไม่ตีกับยาชุดนี้ (คาเฟอีน ไขมันสูง อาหารทะเล กล้วย ถั่ว ผักโขม ฯลฯ)
  --  หรือไม่ติ๊กหมวดเลย เหมือนคนทั่วไปที่กินข้าวแกงธรรมดา
  --  หมวดที่ตีกับยาชุดนี้ (แอลกอฮอล์ เกรปฟรุต ส้ม นม กากใยสูง ถั่วเหลือง วิตามินเค)
  --  ใส่เฉพาะมื้อที่ตั้งใจให้มีคำเตือน ไม่งั้นการ์ดในไดอารี่จะขึ้นป้ายส้มทุกใบ
  --
  --  มื้อของวันนี้ใส่เฉพาะที่เวลาผ่านไปแล้ว (รันตอนเช้าจะยังไม่มีมื้อกลางวัน)
  -- ---------------------------------------------------------
  insert into meals (user_id, eaten_at, meal_type, name, food_codes, note, created_at)
  select
    v_user,
    at_time,
    v.meal_type::meal_type,
    v.name,
    v.codes,
    v.note,
    at_time
  from (values
    -- 13 วันก่อน
    (13, '07:20', 'breakfast', 'ข้าวต้มปลา',                     array['iodine'],                         ''),
    (13, '12:10', 'lunch',     'ข้าวมันไก่',                      array['high_fat'],                       ''),
    (13, '18:45', 'dinner',    'แกงส้มชะอมกุ้ง',                  array['iodine'],                         ''),
    -- 12 วันก่อน
    (12, '07:40', 'breakfast', 'ซีเรียลโฮลวีต กับ นมถั่วเหลือง',    array['high_fiber','soy'],               'ลองกินเช้าแบบคลีน'),
    (12, '12:30', 'lunch',     'ก๋วยเตี๋ยวเรือ',                   '{}'::text[],                            ''),
    (12, '19:00', 'dinner',    'ปลากะพงนึ่งมะนาว',                 array['iodine','photosensitive'],        ''),
    -- 11 วันก่อน
    (11, '07:15', 'breakfast', 'โจ๊กหมูใส่ไข่',                    '{}'::text[],                            ''),
    (11, '12:20', 'lunch',     'ข้าวกะเพราหมูไข่ดาว',              array['high_fat'],                       ''),
    (11, '15:30', 'snack',     'กล้วยน้ำว้า',                      array['potassium'],                      ''),
    (11, '18:50', 'dinner',    'ต้มยำกุ้งน้ำใส',                    array['iodine'],                         ''),
    -- 10 วันก่อน
    (10, '07:30', 'breakfast', 'ข้าวเหนียวหมูปิ้ง',                 array['high_fat'],                       'ซื้อหน้าปากซอย'),
    (10, '12:15', 'lunch',     'ส้มตำไก่ย่าง',                     '{}'::text[],                            ''),
    (10, '19:10', 'dinner',    'ผัดผักบุ้งไฟแดง กับ ข้าวสวย',       '{}'::text[],                            ''),
    -- 9 วันก่อน
    ( 9, '07:25', 'breakfast', 'กาแฟดำ กับ ปาท่องโก๋',              array['caffeine','high_fat'],            ''),
    ( 9, '12:40', 'lunch',     'ข้าวผัดกุ้ง',                      array['iodine'],                         ''),
    ( 9, '19:30', 'dinner',    'สเต๊กเนื้อ กับ ไวน์แดง',            array['alcohol','high_fat'],             'วันเกิดแฟน'),
    -- 8 วันก่อน
    ( 8, '07:10', 'breakfast', 'ข้าวต้มหมู',                       '{}'::text[],                            ''),
    ( 8, '12:05', 'lunch',     'บะหมี่เกี๊ยวหมูแดง',                '{}'::text[],                            ''),
    ( 8, '18:40', 'dinner',    'แกงเขียวหวานไก่ กับ ขนมจีน',        array['high_fat'],                       ''),
    -- 7 วันก่อน
    ( 7, '07:35', 'breakfast', 'ไข่กระทะ กับ ขนมปัง',               array['high_fat'],                       ''),
    ( 7, '12:30', 'lunch',     'ข้าวหมูแดง',                       '{}'::text[],                            ''),
    ( 7, '15:45', 'snack',     'ถั่วลิสงอบ',                        array['nuts_seeds'],                     ''),
    ( 7, '19:00', 'dinner',    'ยำวุ้นเส้นทะเล',                    array['iodine'],                         ''),
    -- 6 วันก่อน
    ( 6, '07:20', 'breakfast', 'โจ๊กหมู',                          '{}'::text[],                            ''),
    ( 6, '12:10', 'lunch',     'ผัดคะน้าหมูกรอบ กับ ข้าว',           array['vitamin_k','high_fat'],           ''),
    ( 6, '18:30', 'dinner',    'ต้มจืดตำลึงหมูสับ',                 '{}'::text[],                            ''),
    -- 5 วันก่อน
    ( 5, '07:30', 'breakfast', 'อเมริกาโน่ กับ ครัวซองต์',           array['caffeine','high_fat'],            ''),
    ( 5, '12:20', 'lunch',     'ข้าวขาหมู',                        array['high_fat'],                       ''),
    ( 5, '19:15', 'dinner',    'ปลาทอดน้ำปลา กับ ผัดผักรวม',         array['iodine'],                         ''),
    -- 4 วันก่อน
    ( 4, '07:15', 'breakfast', 'ข้าวไข่เจียวหมูสับ',                 array['high_fat'],                       ''),
    ( 4, '12:35', 'lunch',     'ราดหน้าหมู',                       '{}'::text[],                            ''),
    ( 4, '15:20', 'snack',     'กล้วยหอม',                        array['potassium'],                      ''),
    ( 4, '18:50', 'dinner',    'แกงป่าไก่',                        '{}'::text[],                            ''),
    -- 3 วันก่อน (วันที่ได้ยาปฏิชีวนะจากคลินิก)
    ( 3, '07:40', 'breakfast', 'ข้าวต้มกุ้ง',                       array['iodine'],                         ''),
    ( 3, '12:15', 'lunch',     'สุกี้น้ำทะเล',                      array['iodine'],                         ''),
    ( 3, '19:20', 'dinner',    'ไก่ทอด กับ ข้าวเหนียว',             array['high_fat'],                       'ไม่ค่อยสบาย ไปคลินิกมา'),
    -- 2 วันก่อน
    ( 2, '07:20', 'breakfast', 'โจ๊กหมูใส่ไข่',                     '{}'::text[],                            ''),
    ( 2, '12:30', 'lunch',     'ก๋วยเตี๋ยวต้มยำ',                   '{}'::text[],                            ''),
    ( 2, '18:40', 'dinner',    'ผัดผักโขมกระเทียม กับ ข้าว',         array['oxalate'],                        ''),
    -- เมื่อวาน ← มื้อที่ตีกับยาใหม่หลายแบบ
    ( 1, '07:30', 'breakfast', 'ชานมเย็น กับ ขนมปังเนยสด',          array['dairy','caffeine'],               'ซื้อหน้าปากซอยก่อนเข้างาน'),
    ( 1, '12:15', 'lunch',     'สลัดผักคะน้า น้ำเกรปฟรุตปั่น',       array['vitamin_k','grapefruit','citrus'], 'วันนี้ตั้งใจกินคลีน'),
    ( 1, '19:40', 'dinner',    'หมูกระทะ กับ เบียร์',               array['alcohol','high_fat'],             'เลี้ยงส่งเพื่อนที่ออฟฟิศ'),
    -- วันนี้
    ( 0, '07:30', 'breakfast', 'โจ๊กหมู กับ นมถั่วเหลือง',           array['soy'],                            ''),
    ( 0, '12:20', 'lunch',     'ข้าวผัดกุ้ง',                      array['iodine'],                         ''),
    ( 0, '15:20', 'snack',     'ส้มโอ กับ โยเกิร์ต',                array['citrus','dairy'],                 'ของว่างบ่าย'),
    ( 0, '18:45', 'dinner',    'ต้มจืดเต้าหู้หมูสับ',                array['soy'],                            '')
  ) as v(days_ago, clock, meal_type, name, codes, note)
  cross join lateral (
    select ((v_today - v.days_ago) + v.clock::time) at time zone 'Asia/Bangkok' as at_time
  ) t
  where t.at_time < now();

  -- ---------------------------------------------------------
  --  คำเตือน ยา-อาหาร
  --
  --  สร้างจากการ join ตารางจริง และประกอบข้อความรูปแบบเดียวกับที่แอปเขียน
  --  คือ '<ชื่อยา> กับ <หมวดอาหาร> · มื้อ <ชื่อมื้อ>'
  --
  --  นับเฉพาะยาที่เพิ่มก่อนมื้อนั้น เหมือนแอปที่ตรวจตอนกดบันทึกมื้อ
  --  เช่น มื้อที่มีนมเมื่อ 10 วันก่อน ต้องไม่มีคำเตือนกับยาปฏิชีวนะที่เพิ่งได้มา 3 วัน
  -- ---------------------------------------------------------
  insert into interaction_alerts
    (user_id, meal_id, medication_id, kind, severity, message_th, created_at)
  select
    v_user,
    m.id,
    null,
    'drug_food',
    dfi.severity,
    med.name || ' กับ ' || fc.label_th || ' · มื้อ ' || m.name,
    m.eaten_at
  from meals m
  -- ตั้งชื่อคอลัมน์ของ unnest ให้ชัด ไม่ใช้ชื่อ code เฉย ๆ
  -- เพราะ food_categories ก็มีคอลัมน์ชื่อ code เหมือนกัน แล้ว Postgres จะตัดสินไม่ได้
  cross join lateral unnest(m.food_codes) as f(food_code)
  join food_categories fc          on fc.code = f.food_code
                                  and fc.selectable = true
  join drug_food_interactions dfi  on dfi.food_code = f.food_code
  join medications med             on med.drug_id = dfi.drug_id
                                  and med.user_id = v_user
                                  and med.status = 'active'
                                  and med.created_at <= m.eaten_at
  where m.user_id = v_user;

  -- ---------------------------------------------------------
  --  คำเตือน ยา-ยา
  --
  --  ข้อความรูปแบบเดียวกับแอป คือ '<ชื่อยา> ใช้ร่วมกับ <ยาอีกตัว>'
  --  บันทึกให้เฉพาะยาที่เพิ่มเข้ามาทีหลัง ตรงกับพฤติกรรมจริงที่แอปเขียนคำเตือนตอนกดบันทึกยาตัวใหม่
  -- ---------------------------------------------------------
  insert into interaction_alerts
    (user_id, meal_id, medication_id, kind, severity, message_th, created_at)
  select
    v_user,
    null,
    mine.id,
    'drug_drug',
    ddi.severity,
    mine.name || ' ใช้ร่วมกับ ' || other_ref.name_en,
    mine.created_at
  from medications mine
  join drug_drug_interactions ddi
    on mine.drug_id in (ddi.drug_a_id, ddi.drug_b_id)
  join drug_reference other_ref
    on other_ref.id = case
         when ddi.drug_a_id = mine.drug_id then ddi.drug_b_id
         else ddi.drug_a_id
       end
  join medications other_med
    on other_med.drug_id = other_ref.id
   and other_med.user_id = v_user
   and other_med.status = 'active'
  where mine.user_id = v_user
    and mine.name in ('Ibuprofen', 'Dextromethorphan', 'Ciprofloxacin')
    -- คู่ที่เป็นยาซื้อเองทั้งสองฝั่ง (เช่น Ciprofloxacin กับ Ibuprofen)
    -- จะเข้าเงื่อนไขจากทั้งสองมุม ต้องเก็บมุมเดียว ไม่งั้นได้คำเตือนซ้ำแบบกลับข้าง
    and (
      other_med.name not in ('Ibuprofen', 'Dextromethorphan', 'Ciprofloxacin')
      or mine.name < other_med.name
    );

  raise notice 'ใส่ข้อมูลเดโมให้ % เรียบร้อย', v_email;
end $$;

-- ============================================================
--  ตรวจผล
--
--  ถ้าเปลี่ยนอีเมลด้านบน ต้องเปลี่ยนในคำสั่งด้านล่างนี้ด้วย
-- ============================================================

with demo as (
  select id from auth.users where email = 'demo@planpill.dev'
)
select 'ยา' as รายการ, count(*) as จำนวน
  from medications where user_id = (select id from demo)
union all
select 'มื้ออาหาร', count(*)
  from meals where user_id = (select id from demo)
union all
select 'มื้ออาหารที่มีคำเตือน', count(distinct meal_id)
  from interaction_alerts where user_id = (select id from demo) and meal_id is not null
union all
select 'ประวัติการกินยา', count(*)
  from dose_logs where user_id = (select id from demo)
union all
select 'คำเตือนทั้งหมด', count(*)
  from interaction_alerts where user_id = (select id from demo)
union all
select 'คำเตือนระดับอันตราย', count(*)
  from interaction_alerts
  where user_id = (select id from demo) and severity = 'major';

-- ประวัติการกินยาแยกเป็น กินตรงเวลา / ช้ากว่านัด / ไม่ได้บันทึก / ข้าม
with demo as (
  select id from auth.users where email = 'demo@planpill.dev'
)
select
  case
    when status = 'taken'
     and taken_at <= scheduled_at + interval '30 minutes' then 'กินตรงเวลา'
    when status = 'taken'                                 then 'ช้ากว่านัด'
    when status = 'missed'                                then 'ไม่ได้บันทึก'
    else 'ข้ามมื้อ'
  end as แบบ,
  count(*) as จำนวน,
  round(count(*) * 100.0 / sum(count(*)) over (), 1) as เปอร์เซ็นต์
from dose_logs
where user_id = (select id from demo)
group by 1
order by 2 desc;

-- รายการคำเตือนที่จะได้เห็นตอนนำเสนอ เรียงจากรุนแรงที่สุด
with demo as (
  select id from auth.users where email = 'demo@planpill.dev'
)
select severity as ระดับ, kind as ประเภท, message_th as รายละเอียด,
       (created_at at time zone 'Asia/Bangkok')::date as วันที่
from interaction_alerts
where user_id = (select id from demo)
order by
  case severity when 'major' then 1 when 'moderate' then 2 else 3 end,
  created_at desc;
