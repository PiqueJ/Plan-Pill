/**
 * PlanPill - shared TypeScript types
 *
 * ตรงกับ planpill-schema/schema.sql โดยแปลงชื่อฟิลด์จาก snake_case ของ Postgres
 * เป็น camelCase ตามที่ใช้ในฝั่ง React Native
 *
 * เวลาแก้ไฟล์นี้ ต้องแก้ schema.sql ให้ตรงกันด้วยเสมอ
 *
 * userId เป็น optional เพราะหน้าจอไม่จำเป็นต้องรู้ค่านี้
 * ชั้น services/storage.ts จะเติมให้เองตอนบันทึกขึ้น Supabase
 */

// ============================================================
//  Enum — ค่าต้องตรงกับ enum ใน Postgres ทุกตัว
// ============================================================

/** ระดับความรุนแรงของปฏิกิริยา ใช้คำเดียวกับ DDInter */
export type SeverityLevel = "major" | "moderate" | "minor";

/** ความสัมพันธ์ระหว่างยากับมื้ออาหาร */
export type MealRelation =
  | "before_meal"
  | "after_meal"
  | "with_meal"
  | "independent";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/**
 * สถานะของยา 1 มื้อ
 *
 * upcoming → ยังไม่ถึงเวลา
 * reminded → แจ้งเตือนแล้ว รอผู้ใช้ยืนยัน
 * taken    → ผู้ใช้กดยืนยันว่ารับประทานแล้ว
 * skipped  → ผู้ใช้กดข้ามมื้อนี้
 * missed   → เลยเวลามาแล้วโดยไม่มีการยืนยัน (ระบบตั้งให้อัตโนมัติ)
 *
 * ข้อจำกัดสำคัญ: ระบบบันทึกจากการกดยืนยันของผู้ใช้เท่านั้น
 * จึงไม่สามารถยืนยันได้ว่าผู้ใช้รับประทานยาจริงตามที่บันทึก
 */
export type DoseStatus =
  | "upcoming"
  | "reminded"
  | "taken"
  | "skipped"
  | "missed";

/** manual = ผู้ใช้กดเอง, auto = ระบบตั้งให้อัตโนมัติ (เช่น ปิดรอบเป็น missed) */
export type LogSource = "manual" | "auto";

export type MedicationStatus = "active" | "paused";

// ============================================================
//  ตารางอ้างอิง (อ่านอย่างเดียว นำเข้าจาก DDInter 2.0)
// ============================================================

/** หมวดอาหารที่มีข้อควรระวังทางยา (ตาราง food_categories) */
export type FoodCategory = {
  /** ค่าที่เก็บลงฐานข้อมูล เช่น "dairy" */
  code: string;
  /** ชื่อหมวดภาษาไทยที่แสดงในแอป */
  labelTh: string;
  /** ตัวอย่างอาหาร ช่วยให้ผู้ใช้เลือกถูกหมวด */
  examplesTh: string;
  sortOrder: number;
};

/** ยาในฐานอ้างอิง (ตาราง drug_reference) */
export type DrugReference = {
  id: string;
  /** ชื่อสามัญภาษาอังกฤษ ไม่แปลเป็นไทยตามมาตรฐานสากล เช่น "Paracetamol" */
  nameEn: string;
  /** หมวดยาภาษาไทยสำหรับแสดงคู่กับชื่อยา เช่น "ยาแก้ปวด / ลดไข้" */
  categoryTh: string | null;
  createdAt: string;
};

/** ผลลัพธ์จาก RPC search_drugs (ค้นหาชื่อยาแบบใกล้เคียง) */
export type DrugSearchResult = {
  id: string;
  nameEn: string;
  categoryTh: string | null;
  /**
   * คำที่ทำให้ค้นเจอ อาจเป็นชื่อหลักหรือชื่อพ้อง
   *
   * ใช้บอกผู้ใช้ว่าคำที่พิมพ์ตรงกับยาตัวไหน เช่น พิมพ์ "พารา"
   * แล้วเจอ Acetaminophen ควรแสดงว่า "พารา → Acetaminophen"
   * ไม่งั้นผู้ใช้จะงงว่าทำไมได้ชื่อที่ไม่เคยเห็น
   */
  matchedVia: string;
  /** คะแนนความใกล้เคียงจาก pg_trgm ยิ่งมากยิ่งใกล้ */
  score: number;
};

/** ชื่อพ้องของยา (ตาราง drug_aliases) */
export type DrugAlias = {
  id: string;
  drugId: string;
  alias: string;
  /** inn = ชื่อสากลบนซองยา, thai = คำอ่านไทย, brand = ชื่อการค้า, abbrev = คำย่อที่คนเรียกกัน */
  aliasType: "inn" | "thai" | "brand" | "abbrev";
};

// ============================================================
//  ตารางข้อมูลผู้ใช้
// ============================================================

/** ยา 1 รายการของผู้ใช้ (ตาราง medications) */
export type Medication = {
  id: string;
  /** เติมโดย Supabase ตอน sync — ตอนเก็บในเครื่องยังไม่ใช้ */
  userId?: string;
  /** อ้างถึงยาในฐานอ้างอิง null = ผู้ใช้กรอกยาที่ไม่มีในระบบ จึงตรวจปฏิกิริยาไม่ได้ */
  drugId: string | null;
  name: string;
  dosage: string;
  quantity: number;
  /** เวลาที่ต้องรับประทานในแต่ละวัน รูปแบบ "HH:MM" (24 ชั่วโมง) */
  reminderTimes: string[];
  mealRelation: MealRelation;
  /**
   * หมวดอาหารที่ควรเลี่ยงของยาตัวนี้ (เก็บเป็น code ของ FoodCategory)
   *
   * คัดลอกมาจากตารางอ้างอิงตอนเพิ่มยา ไม่ได้ join สดทุกครั้ง
   * ข้อดีคืออ่านเร็วและทำงานตอนออฟไลน์ได้
   * ข้อเสียคือถ้าทีมแก้ข้อมูลอ้างอิงภายหลัง ยาที่เพิ่มไปแล้วจะไม่อัปเดตเอง
   * จึงต้องมีปุ่มซิงค์ข้อมูลอ้างอิงใหม่ในหน้าตั้งค่า
   */
  foodRiskCodes: string[];
  note: string;
  status: MedicationStatus;
  /**
   * id ของ notification ที่ตั้งไว้ ใช้สำหรับยกเลิกตอนแก้ไข/ลบยา
   *
   * เป็นข้อมูลเฉพาะเครื่อง ไม่ sync ขึ้น Supabase เพราะ id ของแต่ละเครื่องไม่ตรงกัน
   */
  notificationIds: string[];
  createdAt: string;
  /**
   * เวลาที่แก้ไข reminderTimes ครั้งล่าสุด
   *
   * ใช้กันไม่ให้ระบบสร้างประวัติย้อนหลังของเวลาที่เพิ่งเพิ่มเข้ามา
   * เช่น เพิ่มเวลา 05:00 วันนี้ ต้องไม่ทำให้เกิดประวัติ "ไม่ได้บันทึก" ของ 05:00 เมื่อวาน
   */
  remindersUpdatedAt: string;
  updatedAt: string;
};

/** มื้ออาหาร 1 รายการ (ตาราง meals) */
export type Meal = {
  id: string;
  userId?: string;
  /** เวลาที่รับประทาน (ISO string) */
  eatenAt: string;
  mealType: MealType;
  /** ชื่อมื้อแบบพิมพ์อิสระ เช่น "ข้าวมันไก่" ไม่ผูกกับฐานข้อมูลอาหารใด ๆ */
  name: string;
  /** หมวดอาหารที่ผู้ใช้ติ๊กเลือก ใช้ตรวจปฏิกิริยากับยา */
  foodCodes: string[];
  /** path ของรูปใน Supabase Storage — null = ไม่ได้ถ่ายรูป (การถ่ายรูปเป็นตัวเลือกเสริม) */
  photoPath: string | null;
  note: string;
  createdAt: string;
};

/** ประวัติยา 1 มื้อ (ตาราง dose_logs) */
export type DoseLog = {
  /** `${medicationId}__${scheduledAt}` เพื่อให้ 1 มื้อมี log ได้เพียงรายการเดียว */
  id: string;
  userId?: string;
  medicationId: string;
  /** เก็บชื่อและขนาดซ้ำไว้ เพื่อให้ประวัติอ่านรู้เรื่องแม้ยาถูกลบไปแล้ว */
  medicationName: string;
  dosage: string;
  /** เวลาที่ควรรับประทาน (ISO string) */
  scheduledAt: string;
  /** เวลาที่ผู้ใช้กดยืนยันว่ารับประทานแล้ว (ISO string) */
  takenAt: string | null;
  status: DoseStatus;
  source: LogSource | null;
  createdAt: string;
};

/** คำเตือนปฏิกิริยาที่ระบบเคยแสดง (ตาราง interaction_alerts) */
export type InteractionAlert = {
  id: string;
  userId?: string;
  mealId: string | null;
  medicationId: string | null;
  kind: "drug_food" | "drug_drug";
  severity: SeverityLevel;
  messageTh: string;
  createdAt: string;
};

// ============================================================
//  ผลลัพธ์จาก RPC ตรวจปฏิกิริยา
// ============================================================

/**
 * ผลจาก check_drug_drug — ยาที่กำลังจะเพิ่ม ตีกับยาที่กินอยู่
 *
 * ข้อความเป็น null ได้ เพราะไฟล์ drug-drug ของ DDInter มีแค่ระดับความรุนแรง
 * ไม่มีคำอธิบายมาด้วย หน้าจอจึงต้องรองรับกรณีที่มีแต่ระดับความรุนแรงอย่างเดียว
 */
export type DrugDrugResult = {
  otherName: string;
  severity: SeverityLevel;
  mechanismTh: string | null;
  managementTh: string | null;
};

/**
 * ผลจาก check_meal_interactions — หมวดอาหารในมื้อนี้ ตีกับยาที่กินอยู่
 *
 * ข้อมูลยา-อาหารมีคำอธิบายครบ แต่แปลไทยแล้วประมาณครึ่งเดียว
 * ที่ยังไม่ได้แปลจะเป็น null ให้แสดง descriptionEn แทน
 */
export type MealInteractionResult = {
  medicationName: string;
  foodLabelTh: string;
  severity: SeverityLevel;
  mechanismTh: string | null;
  managementTh: string | null;
  descriptionEn: string | null;
  managementEn: string | null;
};

// ============================================================
//  ป้ายกำกับภาษาไทย
//
//  ชื่อยาคงภาษาอังกฤษ ส่วนที่เหลือแสดงเป็นไทยทั้งหมด
//  เก็บเป็นค่าคงที่ในโค้ด ไม่ต้องเก็บในฐานข้อมูลเพราะเป็นค่าตายตัว
// ============================================================

export const severityLabel: Record<SeverityLevel, string> = {
  major: "อันตราย",
  moderate: "ควรระวัง",
  minor: "เล็กน้อย",
};

export const mealRelationLabel: Record<MealRelation, string> = {
  before_meal: "ก่อนอาหาร",
  after_meal: "หลังอาหาร",
  with_meal: "พร้อมอาหาร",
  independent: "ไม่เกี่ยวกับมื้ออาหาร",
};

export const mealTypeLabel: Record<MealType, string> = {
  breakfast: "มื้อเช้า",
  lunch: "มื้อกลางวัน",
  dinner: "มื้อเย็น",
  snack: "ของว่าง",
};

/** เตือนให้เติมยาเมื่อเหลือน้อยกว่าหรือเท่ากับจำนวนนี้ */
export const LOW_STOCK_THRESHOLD = 5;

export function isLowStock(quantity: number) {
  return quantity <= LOW_STOCK_THRESHOLD;
}

/** ยาพอกินอีกไม่ถึงกี่วัน ถึงนับว่าใกล้หมด */
export const LOW_SUPPLY_DAYS = 7;

/**
 * ยาที่เหลือพอกินอีกกี่วัน คิดจาก 1 หน่วยต่อ 1 เวลาที่ต้องกิน
 *
 * ขนาดยาเป็นข้อความอิสระ (เช่น "500 มก. · 2 เม็ด") จึงแยกจำนวนเม็ดต่อครั้งออกมาไม่ได้
 * ตัวเลขนี้จึงเป็นค่าประมาณ หน้าจอต้องเขียนว่า "ประมาณ" ทุกครั้ง
 * คืน null เมื่อไม่มีเวลาที่ต้องกิน (คำนวณไม่ได้)
 */
export function daysOfSupply(medication: Pick<Medication, "quantity" | "reminderTimes">) {
  const perDay = medication.reminderTimes.length;
  return perDay > 0 ? Math.floor(medication.quantity / perDay) : null;
}

/** ใกล้หมด: เหลือไม่เกิน 5 หน่วย หรือพอกินอีกไม่เกิน 7 วัน */
export function isLowSupply(medication: Pick<Medication, "quantity" | "reminderTimes">) {
  const days = daysOfSupply(medication);
  return isLowStock(medication.quantity) || (days !== null && days <= LOW_SUPPLY_DAYS);
}
