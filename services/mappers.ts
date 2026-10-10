/**
 * PlanPill - แปลงข้อมูลระหว่างรูปแบบของ Postgres กับของแอป
 *
 * Postgres ใช้ snake_case ส่วนฝั่ง React Native ใช้ camelCase
 * รวมการแปลงไว้ที่เดียว เพื่อให้เวลา schema เปลี่ยนแก้จุดเดียวจบ
 *
 * จุดที่ต้องระวัง: dose_logs ในฐานข้อมูลใช้ uuid เป็น primary key
 * แต่ฝั่งแอปใช้ id แบบ `${medicationId}__${scheduledAt}` เพื่อกันบันทึกซ้ำในมื้อเดียวกัน
 * mapper จึงคำนวณ id ของแอปกลับมาจาก medication_id กับ scheduled_at
 * (ทำได้เพราะฐานข้อมูลมี unique (user_id, medication_id, scheduled_at) รองรับอยู่แล้ว)
 */

import { makeDoseId, normalizeTimestamp } from "./schedule";
import { DoseLog, InteractionAlert, Meal, Medication } from "../types";

/* -------------------------------- ยา -------------------------------- */

/** แถวจากตาราง medications */
export type MedicationRow = {
  id: string;
  user_id: string;
  drug_id: string | null;
  name: string;
  dosage: string;
  quantity: number;
  reminder_times: string[];
  meal_relation: Medication["mealRelation"];
  food_risk_codes: string[];
  note: string;
  status: Medication["status"];
  created_at: string;
  reminders_updated_at: string;
  updated_at: string;
};

export function medicationFromRow(
  row: MedicationRow,
  /** notificationIds เป็นข้อมูลเฉพาะเครื่อง ฐานข้อมูลไม่มีคอลัมน์นี้ */
  localNotificationIds: string[] = []
): Medication {
  return {
    id: row.id,
    userId: row.user_id,
    drugId: row.drug_id,
    name: row.name,
    dosage: row.dosage,
    quantity: row.quantity,
    reminderTimes: row.reminder_times ?? [],
    mealRelation: row.meal_relation,
    foodRiskCodes: row.food_risk_codes ?? [],
    note: row.note ?? "",
    status: row.status,
    notificationIds: localNotificationIds,
    createdAt: row.created_at,
    remindersUpdatedAt: row.reminders_updated_at,
    updatedAt: row.updated_at,
  };
}

export function medicationToRow(medication: Medication, userId: string) {
  return {
    id: medication.id,
    user_id: userId,
    drug_id: medication.drugId,
    name: medication.name,
    dosage: medication.dosage,
    quantity: medication.quantity,
    reminder_times: medication.reminderTimes,
    meal_relation: medication.mealRelation,
    food_risk_codes: medication.foodRiskCodes,
    note: medication.note,
    status: medication.status,
    created_at: medication.createdAt,
    reminders_updated_at: medication.remindersUpdatedAt,
    updated_at: medication.updatedAt,
  };
}

/* ---------------------------- ประวัติมื้อยา ---------------------------- */

/** แถวจากตาราง dose_logs */
export type DoseLogRow = {
  id: string;
  user_id: string;
  medication_id: string | null;
  medication_name: string;
  dosage: string;
  scheduled_at: string;
  taken_at: string | null;
  status: DoseLog["status"];
  source: DoseLog["source"];
  created_at: string;
};

export function doseLogFromRow(row: DoseLogRow): DoseLog {
  const medicationId = row.medication_id ?? "";

  return {
    // สร้าง id ของแอปกลับมาจากคีย์ธรรมชาติ ไม่ใช้ uuid ของฐานข้อมูล
    id: makeDoseId(medicationId, row.scheduled_at),
    userId: row.user_id,
    medicationId,
    medicationName: row.medication_name,
    dosage: row.dosage ?? "",
    // แปลงเป็นรูปแบบเดียวกับที่แอปสร้างเอง เพื่อให้เทียบและเรียงลำดับได้ตรงกัน
    scheduledAt: normalizeTimestamp(row.scheduled_at),
    takenAt: row.taken_at ? normalizeTimestamp(row.taken_at) : null,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
  };
}

/**
 * แปลงเป็นแถวสำหรับเขียนลงฐานข้อมูล
 *
 * ไม่ส่ง id ไปด้วย เพราะ id ฝั่งแอปเป็นข้อความ ไม่ใช่ uuid
 * ให้ฐานข้อมูลจัดการ id เอง แล้วชี้ขาดความซ้ำด้วย unique constraint แทน
 */
export function doseLogToRow(log: DoseLog, userId: string) {
  return {
    user_id: userId,
    medication_id: log.medicationId || null,
    medication_name: log.medicationName,
    dosage: log.dosage,
    scheduled_at: log.scheduledAt,
    taken_at: log.takenAt,
    status: log.status,
    source: log.source,
    created_at: log.createdAt,
  };
}

/** คอลัมน์ที่ใช้ชี้ขาดว่าแถวซ้ำกันหรือไม่ ตรงกับ unique constraint ในตาราง */
export const DOSE_LOG_CONFLICT_TARGET = "user_id,medication_id,scheduled_at";

/* ------------------------------ มื้ออาหาร ------------------------------ */

/** แถวจากตาราง meals */
export type MealRow = {
  id: string;
  user_id: string;
  eaten_at: string;
  meal_type: Meal["mealType"];
  name: string;
  food_codes: string[];
  photo_path: string | null;
  note: string;
  created_at: string;
};

export function mealFromRow(row: MealRow): Meal {
  return {
    id: row.id,
    userId: row.user_id,
    eatenAt: row.eaten_at,
    mealType: row.meal_type,
    name: row.name ?? "",
    foodCodes: row.food_codes ?? [],
    photoPath: row.photo_path,
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

export function mealToRow(meal: Meal, userId: string) {
  return {
    id: meal.id,
    user_id: userId,
    eaten_at: meal.eatenAt,
    meal_type: meal.mealType,
    name: meal.name,
    food_codes: meal.foodCodes,
    photo_path: meal.photoPath,
    note: meal.note,
    created_at: meal.createdAt,
  };
}

/* ------------------------------ คำเตือน ------------------------------ */

/** แถวจากตาราง interaction_alerts */
export type InteractionAlertRow = {
  id: string;
  user_id: string;
  meal_id: string | null;
  medication_id: string | null;
  kind: InteractionAlert["kind"];
  severity: InteractionAlert["severity"];
  message_th: string;
  created_at: string;
};

export function alertFromRow(row: InteractionAlertRow): InteractionAlert {
  return {
    id: row.id,
    userId: row.user_id,
    mealId: row.meal_id,
    medicationId: row.medication_id,
    kind: row.kind,
    severity: row.severity,
    messageTh: row.message_th,
    createdAt: row.created_at,
  };
}

export function alertToRow(alert: InteractionAlert, userId: string) {
  return {
    id: alert.id,
    user_id: userId,
    meal_id: alert.mealId,
    medication_id: alert.medicationId,
    kind: alert.kind,
    severity: alert.severity,
    message_th: alert.messageTh,
    created_at: alert.createdAt,
  };
}
