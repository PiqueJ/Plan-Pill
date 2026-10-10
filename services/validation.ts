/**
 * PlanPill - input validation
 *
 * ตรวจข้อมูลก่อนบันทึกลงฐานข้อมูล ครอบคลุม 3 กรณีตามข้อกำหนดของรายวิชา
 * missing value, invalid range และ duplicate record
 */

import { Meal, Medication } from "../types";

export type MedicationInput = {
  name: string;
  dosage: string;
  /** รับมาเป็น string เพราะมาจาก TextInput โดยตรง */
  quantity: string;
  reminderTimes: string[];
  note: string;
};

export type MedicationErrors = {
  name?: string;
  dosage?: string;
  quantity?: string;
  reminderTimes?: string;
};

/** ตรวจว่าเป็นเวลารูปแบบ "HH:MM" แบบ 24 ชั่วโมงและอยู่ในช่วงที่ถูกต้อง */
export function isValidTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/** แปลง "8:5" ให้เป็น "08:05" เพื่อให้ข้อมูลที่เก็บมีรูปแบบเดียวกันเสมอ */
export function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return value.trim();
  }

  const hour = Number(match[1]).toString().padStart(2, "0");
  const minute = Number(match[2]).toString().padStart(2, "0");

  return `${hour}:${minute}`;
}

/**
 * ตรวจข้อมูลยาทั้งฟอร์ม
 *
 * @param input        ข้อมูลที่ผู้ใช้กรอก
 * @param medications  รายการยาที่มีอยู่แล้ว ใช้ตรวจ duplicate
 * @param editingId    id ของยาที่กำลังแก้ไข (ไม่ต้องนับตัวเองว่าซ้ำ)
 */
export function validateMedication(
  input: MedicationInput,
  medications: Medication[],
  editingId?: string
): MedicationErrors {
  const errors: MedicationErrors = {};

  // 1) missing value
  if (!input.name.trim()) {
    errors.name = "กรอกชื่อยา แล้วเลือกจากรายการถ้ามี";
  }

  if (!input.dosage.trim()) {
    errors.dosage = "กรอกขนาดต่อครั้ง เช่น 500 มก. หรือ 1 เม็ด";
  }

  // 2) invalid range
  const quantity = Number(input.quantity);

  if (!input.quantity.trim()) {
    errors.quantity = "กรอกจำนวนยาที่เหลืออยู่ตอนนี้";
  } else if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    errors.quantity = "จำนวนยาต้องเป็นตัวเลขจำนวนเต็ม";
  } else if (quantity < 1 || quantity > 999) {
    errors.quantity = "คงเหลือต้องอยู่ระหว่าง 1–999";
  }

  const times = input.reminderTimes.map((time) => time.trim()).filter(Boolean);

  if (times.length === 0) {
    errors.reminderTimes = "เลือกเวลาที่ต้องกินอย่างน้อย 1 เวลา";
  } else if (times.some((time) => !isValidTime(time))) {
    errors.reminderTimes = "รูปแบบเวลาไม่ถูกต้อง ใช้รูปแบบ HH:MM เช่น 08:00";
  } else {
    // 3) duplicate record - เวลาซ้ำกันเองภายในยาตัวเดียวกัน
    const normalized = times.map(normalizeTime);
    const unique = new Set(normalized);

    if (unique.size !== normalized.length) {
      errors.reminderTimes = "มีเวลาซ้ำกัน กรุณาตรวจสอบอีกครั้ง";
    }
  }

  // 3) duplicate record - ยาชื่อซ้ำกับรายการที่มีอยู่แล้ว
  if (!errors.name) {
    const isDuplicate = medications.some(
      (item) =>
        item.id !== editingId &&
        item.name.trim().toLowerCase() === input.name.trim().toLowerCase()
    );

    if (isDuplicate) {
      errors.name = "มีในรายการแล้ว · เปิดรายการเดิมเพื่อเพิ่มเวลา";
    }
  }

  return errors;
}

/** ใช้ได้กับทุกฟอร์ม เพราะทุก error object เก็บเฉพาะฟิลด์ที่ผิดจริง */
export function hasErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}

/* ------------------------------ มื้ออาหาร ------------------------------ */

export type MealInput = {
  name: string;
  /** รับมาเป็น "HH:MM" จาก TextInput */
  time: string;
  foodCodes: string[];
  note: string;
};

export type MealErrors = {
  name?: string;
  time?: string;
  foodCodes?: string;
};

/**
 * ตรวจข้อมูลมื้ออาหาร
 *
 * ต่างจากยาตรงที่ไม่บังคับให้ติ๊กหมวดอาหาร เพราะบางมื้อผู้ใช้อาจอยากบันทึกไว้เฉย ๆ
 * การบังคับติ๊กจะทำให้ผู้ใช้ติ๊กมั่วเพื่อให้ผ่าน ซึ่งทำให้ผลตรวจปฏิกิริยาเชื่อถือไม่ได้
 *
 * @param meals      มื้อที่บันทึกไว้แล้ว ใช้ตรวจว่าบันทึกซ้ำเวลาเดิมหรือไม่
 * @param editingId  id ของมื้อที่กำลังแก้ไข (ไม่ต้องนับตัวเองว่าซ้ำ)
 */
export function validateMeal(
  input: MealInput,
  meals: Meal[],
  eatenAt: string,
  editingId?: string
): MealErrors {
  const errors: MealErrors = {};

  // 1) missing value
  if (!input.name.trim()) {
    errors.name = "กรุณากรอกชื่อมื้ออาหาร เช่น ข้าวมันไก่";
  }

  // 2) invalid range
  if (!input.time.trim()) {
    errors.time = "กรุณากรอกเวลาที่รับประทาน";
  } else if (!isValidTime(input.time)) {
    errors.time = "รูปแบบเวลาไม่ถูกต้อง ใช้รูปแบบ HH:MM เช่น 12:30";
  }

  // 3) duplicate record - มื้อเดิมชื่อเดียวกันในเวลาเดียวกัน
  if (!errors.name && !errors.time) {
    const isDuplicate = meals.some(
      (item) =>
        item.id !== editingId &&
        item.eatenAt === eatenAt &&
        item.name.trim().toLowerCase() === input.name.trim().toLowerCase()
    );

    if (isDuplicate) {
      errors.name = "บันทึกมื้อนี้ในเวลาเดียวกันไว้แล้ว";
    }
  }

  return errors;
}
