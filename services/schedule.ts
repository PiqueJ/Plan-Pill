/**
 * PlanPill - dose scheduling และ state machine ของแต่ละมื้อยา
 *
 * แนวคิด: รายการยา 1 ตัวมีเวลารับประทานหลายเวลาต่อวัน
 * ระบบจะ "สร้างมื้อยาของวันนั้น" จากข้อมูลยา แล้วนำมารวมกับประวัติที่บันทึกไว้
 * เพื่อคำนวณสถานะปัจจุบัน
 *
 * upcoming → reminded → taken (ผู้ใช้กดยืนยัน)
 *                    ↘ skipped (ผู้ใช้กดข้าม)
 *                    ↘ missed  (เลยเวลาโดยไม่มีการยืนยัน)
 */

import { DoseLog, DoseStatus, Medication } from "../types";
import {
  getDoseLogs,
  getHistoryClearedAt,
  getMedications,
  upsertDoseLogs,
} from "./storage";

/**
 * เลยเวลาที่กำหนดไปนานเท่านี้ (นาที) ถึงนับว่า "ไม่ได้บันทึก"
 *
 * Build Kit กำหนดไว้ 2 ชั่วโมง ก่อนหน้านั้นมื้อยังขึ้นเป็นการ์ด "ถึงเวลาแล้ว" ให้กดบันทึกได้
 * หลังจากนั้นยังบันทึกย้อนหลังได้จากหน้าประวัติ
 */
export const DOSE_WINDOW_MINUTES = 120;

/** อนุญาตให้กดยืนยันก่อนเวลาได้เท่านี้ (นาที) */
export const DOSE_EARLY_MINUTES = 30;

const MINUTE = 60 * 1000;

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function makeDoseId(medicationId: string, scheduledAt: string) {
  // ต้องแปลงเป็นรูปแบบเดียวก่อนเสมอ เพราะเวลาเดียวกันเขียนได้หลายแบบ
  // แอปสร้าง "2026-09-05T16:00:00.000Z" แต่ Postgres คืน "2026-09-05T16:00:00+00:00"
  // ถ้าเอาข้อความดิบมาต่อเป็น id ตรง ๆ สองอันนี้จะกลายเป็นคนละมื้อ
  // ทำให้กดยืนยันรับประทานแล้วสถานะไม่เปลี่ยน เพราะหาบันทึกของตัวเองไม่เจอ
  return `${medicationId}__${normalizeTimestamp(scheduledAt)}`;
}

/** แปลงเวลาให้เป็นรูปแบบ ISO เดียวกันเสมอ คืนค่าเดิมถ้าแปลงไม่ได้ */
export function normalizeTimestamp(value: string) {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** รวมวันที่กับเวลา "HH:MM" ให้เป็น Date เดียว */
export function toScheduledDate(day: Date, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const scheduled = new Date(day);

  scheduled.setHours(hour, minute, 0, 0);

  return scheduled;
}

/** แสดงเวลาเป็น "08:00" โดยไม่พึ่ง locale ของเครื่อง */
export function formatTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");

  return `${hour}:${minute}`;
}

/** แสดงวันที่แบบไทย เช่น "31 ส.ค. 2569" */
export function formatThaiDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${
    date.getFullYear() + 543
  }`;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const THAI_MONTHS_LONG = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/** ตัวย่อวันในแถบปฏิทินสัปดาห์ */
export const THAI_WEEKDAY_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** "อาทิตย์ 21 กันยายน" ใช้บนหัวหน้าวันนี้ */
export function formatWeekdayLong(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${THAI_WEEKDAYS[date.getDay()]} ${date.getDate()} ${THAI_MONTHS_LONG[date.getMonth()]}`;
}

/** "อาทิตย์ 21 ก.ย." ใช้เป็นหัวข้อวันในหน้าประวัติ */
export function formatWeekdayShort(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${THAI_WEEKDAYS[date.getDay()]} ${date.getDate()} ${THAI_MONTHS[date.getMonth()]}`;
}

/** "21 ก.ย." */
export function formatDayMonth(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]}`;
}

/** จุดเริ่มวัน (00:00 ตามเวลาเครื่อง) */
export function startOfDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** วันจันทร์ของสัปดาห์ที่มีวันนี้อยู่ สัปดาห์ในแถบปฏิทินเริ่มวันจันทร์ */
export function startOfWeek(value: Date) {
  const day = startOfDay(value);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

export function addDays(value: Date, days: number) {
  const day = new Date(value);
  day.setDate(day.getDate() + days);
  return day;
}

/** "15 – 21 ก.ย." หรือ "29 ก.ย. – 5 ต.ค." ถ้าคร่อมเดือน */
export function formatWeekRange(weekStart: Date) {
  const end = addDays(weekStart, 6);

  if (weekStart.getMonth() === end.getMonth()) {
    return `${weekStart.getDate()} – ${end.getDate()} ${THAI_MONTHS[end.getMonth()]}`;
  }

  return `${formatDayMonth(weekStart)} – ${formatDayMonth(end)}`;
}

/** "อีก 5 ชม." "อีก 12 นาที" "เลยมา 3 นาที" เทียบเวลาที่กำหนดกับตอนนี้ */
export function describeRelative(scheduledAt: string, now: Date) {
  const minutes = Math.round((new Date(scheduledAt).getTime() - now.getTime()) / MINUTE);
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const amount = hours > 0 ? `${hours} ชม.${rest > 0 && hours < 3 ? ` ${rest} นาที` : ""}` : `${abs} นาที`;

  if (minutes > 0) {
    return `อีก ${amount}`;
  }

  return minutes === 0 ? "ตอนนี้" : `เลยมา ${amount}`;
}

/** ช่วงของวันจากเวลา ใช้จัดกลุ่มมื้อยาในหน้าวันนี้ */
export function periodOf(value: string | Date): "morning" | "noon" | "evening" | "night" {
  const hour = (typeof value === "string" ? new Date(value) : value).getHours();

  if (hour >= 4 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "noon";
  if (hour >= 15 && hour < 20) return "evening";
  return "night";
}

/**
 * บันทึกย้อนหลังได้ภายในกี่ชั่วโมงหลังเวลานัด
 *
 * จำกัดไว้เพราะยิ่งนานยิ่งจำไม่ได้จริงว่ากินหรือเปล่า ประวัติที่ส่งให้แพทย์จะเชื่อถือไม่ได้
 * 24 ชั่วโมงพอสำหรับกรณีลืมกดเมื่อวานเย็นแล้วมานึกได้ตอนเช้า
 */
export const BACKFILL_HOURS = 24;

/** มื้อนี้ยังบันทึกย้อนหลังได้อยู่หรือไม่ (ต้องเป็นมื้อที่ไม่ได้บันทึก และยังไม่เกินเวลาที่กำหนด) */
export function canBackfill(dose: DoseLog, now: Date) {
  const deadline = new Date(dose.scheduledAt).getTime() + BACKFILL_HOURS * 60 * MINUTE;
  return dose.status === "missed" && now.getTime() <= deadline;
}

/** ป้ายกำกับวันที่สำหรับหน้า History */
export function formatDayLabel(value: string | Date, now = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, now)) {
    return "วันนี้";
  }

  if (isSameDay(date, yesterday)) {
    return "เมื่อวาน";
  }

  return formatThaiDate(date);
}

/**
 * คำนวณสถานะของมื้อยาจากเวลาที่กำหนด เวลาที่ผู้ใช้ยืนยัน และเวลาปัจจุบัน
 *
 * @param takenAt   เวลาที่ผู้ใช้กดยืนยันว่ารับประทานแล้ว (null = ยังไม่ได้ยืนยัน)
 * @param isSkipped ผู้ใช้กดข้ามมื้อนี้ไปแล้วหรือไม่
 */
export function resolveStatus(
  scheduledAt: string,
  takenAt: string | null,
  now: Date,
  isSkipped = false
): DoseStatus {
  if (takenAt) {
    return "taken";
  }

  if (isSkipped) {
    return "skipped";
  }

  const scheduled = new Date(scheduledAt).getTime();
  const windowEnd = scheduled + DOSE_WINDOW_MINUTES * MINUTE;
  const current = now.getTime();

  if (current < scheduled) {
    return "upcoming";
  }

  if (current <= windowEnd) {
    return "reminded";
  }

  return "missed";
}

/** มื้อนี้ปิดรอบแล้วหรือยัง (ใช้ตัดสินว่าควรบันทึกลงประวัติถาวรหรือไม่) */
export function isDoseSettled(scheduledAt: string, now: Date) {
  const windowEnd =
    new Date(scheduledAt).getTime() + DOSE_WINDOW_MINUTES * MINUTE;

  return now.getTime() > windowEnd;
}

/** เวลานี้ยังกดยืนยันมื้อที่กำหนดไว้เวลานั้นได้อยู่หรือไม่ */
export function isWithinDoseWindow(scheduledAt: string, eventTime: Date) {
  const scheduled = new Date(scheduledAt).getTime();
  const start = scheduled - DOSE_EARLY_MINUTES * MINUTE;
  const end = scheduled + DOSE_WINDOW_MINUTES * MINUTE;
  const current = eventTime.getTime();

  return current >= start && current <= end;
}

/**
 * เวลาที่ตารางของยารายการนี้เริ่มมีผล
 *
 * ถ้ายังไม่มี remindersUpdatedAt (ข้อมูลที่บันทึกไว้ก่อนมีฟิลด์นี้) ให้ใช้ createdAt แทน
 */
function scheduleEffectiveFrom(medication: Medication) {
  return new Date(medication.remindersUpdatedAt ?? medication.createdAt).getTime();
}

/**
 * สร้างรายการมื้อยาของวันที่กำหนด จากข้อมูลยาและประวัติที่บันทึกไว้
 *
 * จะไม่สร้างมื้อย้อนหลังก่อนวันที่ตารางเริ่มมีผล เพื่อไม่ให้เกิดประวัติที่ไม่เคยเกิดขึ้นจริง
 * แต่ถ้ามื้อนั้นมีประวัติบันทึกไว้แล้วจะยังแสดงตามเดิม เพื่อไม่ให้ข้อมูลที่เคยเกิดขึ้นหายไป
 */
export function buildDosesForDay(
  medications: Medication[],
  logs: DoseLog[],
  day: Date,
  now = new Date()
): DoseLog[] {
  const doses: DoseLog[] = [];

  medications
    .filter((medication) => medication.status === "active")
    .forEach((medication) => {
      const effectiveFrom = scheduleEffectiveFrom(medication);

      medication.reminderTimes.forEach((time) => {
        const scheduled = toScheduledDate(day, time);

        const scheduledAt = scheduled.toISOString();
        const id = makeDoseId(medication.id, scheduledAt);
        const existing = logs.find((log) => log.id === id);

        if (scheduled.getTime() < effectiveFrom && !existing) {
          return;
        }

        const takenAt = existing?.takenAt ?? null;
        const isSkipped = existing?.status === "skipped";

        doses.push({
          id,
          medicationId: medication.id,
          medicationName: medication.name,
          dosage: medication.dosage,
          scheduledAt,
          takenAt,
          status: resolveStatus(scheduledAt, takenAt, now, isSkipped),
          source: existing?.source ?? null,
          createdAt: existing?.createdAt ?? now.toISOString(),
        });
      });
    });

  return doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function buildTodayDoses(
  medications: Medication[],
  logs: DoseLog[],
  now = new Date()
) {
  return buildDosesForDay(medications, logs, now, now);
}

/** มื้อถัดไปที่ยังไม่ถึงเวลา ใช้แสดงบน Dashboard */
export function findNextDose(doses: DoseLog[]) {
  return doses.find((dose) => dose.status === "upcoming") ?? null;
}

/**
 * บันทึกมื้อที่ปิดรอบแล้วลงประวัติถาวร
 *
 * เรียกทุกครั้งที่เปิดหน้า Dashboard หรือ History เพื่อให้ประวัติย้อนหลังครบ
 * แม้ผู้ใช้จะไม่ได้เปิดแอปในช่วงเวลานั้น
 *
 * ส่งขึ้นเซิร์ฟเวอร์เฉพาะมื้อที่ยังไม่เคยมีประวัติ มื้อที่มีอยู่แล้วไม่ต้องส่งซ้ำ
 * เพราะสถานะของมื้อที่ปิดรอบแล้วไม่เปลี่ยนอีก (taken / skipped / missed เป็นสถานะสุดท้าย)
 * ถ้าส่งซ้ำทุกรอบ เครื่องที่ออฟไลน์ตอนผู้ใช้ล้างประวัติจากอีกเครื่อง
 * จะส่งประวัติเก่าจาก cache ของตัวเองกลับขึ้นไปหลังล้างแล้ว
 *
 * @returns จำนวนมื้อที่เพิ่งบันทึกเป็นประวัติใหม่
 */
export async function syncDoseLogs(days = 7, now = new Date()) {
  const [medications, logs, clearedAt] = await Promise.all([
    getMedications(),
    getDoseLogs(),
    getHistoryClearedAt(),
  ]);

  const clearedAtTime = clearedAt ? new Date(clearedAt).getTime() : null;
  const existingIds = new Set(logs.map((log) => log.id));
  const newlySettled: DoseLog[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - offset);

    buildDosesForDay(medications, logs, day, now).forEach((dose) => {
      if (!isDoseSettled(dose.scheduledAt, now) || existingIds.has(dose.id)) {
        return;
      }

      // ไม่สร้างประวัติของมื้อที่เกิดก่อนการล้างประวัติขึ้นมาใหม่
      // (ฐานข้อมูลมี trigger กันซ้ำอีกชั้น ดู migrate-05-user-settings.sql)
      const isBeforeClear =
        clearedAtTime !== null &&
        new Date(dose.scheduledAt).getTime() < clearedAtTime;

      if (isBeforeClear) {
        return;
      }

      newlySettled.push(dose);
    });
  }

  if (newlySettled.length > 0) {
    await upsertDoseLogs(newlySettled);
  }

  return newlySettled.length;
}

/**
 * ยืนยันช้ากว่าเวลาที่กำหนดเกินกี่นาที ถึงนับว่า "ไม่ตรงเวลา"
 *
 * 30 นาทีเป็นเส้นที่พอสมเหตุสมผลสำหรับยาที่กินวันละ 1-2 ครั้ง
 * ช้ากว่านี้ถือว่าคลาดจากตารางจริง ไม่ใช่แค่หยิบยาช้าไปหน่อย
 */
export const LATE_THRESHOLD_MINUTES = 30;

export type DoseTiming = {
  /** ช้ากว่าเวลาที่กำหนดกี่นาที ติดลบได้ถ้ากินก่อนเวลา */
  minutes: number;
  late: boolean;
  /** ข้อความไทยพร้อมแสดง เช่น "ตรงเวลา" หรือ "สาย 1 ชม. 15 นาที" */
  label: string;
};

/**
 * เทียบเวลาที่ยืนยันกับเวลาที่กำหนด
 *
 * คืน null เมื่อยังไม่ได้ยืนยัน (ยังไม่ถึงเวลา ข้ามมื้อ หรือไม่ได้บันทึก)
 * เพราะกรณีพวกนั้นไม่มีเวลาให้เทียบ
 */
export function describeDoseTiming(dose: DoseLog): DoseTiming | null {
  if (!dose.takenAt) {
    return null;
  }

  const minutes = Math.round(
    (new Date(dose.takenAt).getTime() - new Date(dose.scheduledAt).getTime()) /
      60000
  );

  if (minutes <= LATE_THRESHOLD_MINUTES) {
    return { minutes, late: false, label: "ตรงเวลา" };
  }

  // กดหลังพ้นช่วง 2 ชม. ได้ทางเดียวคือปุ่ม "บันทึกย้อนหลัง"
  // บอกว่า "สาย 14 ชม." จะชวนเข้าใจผิดว่ากินยาห่างจากเวลานัดขนาดนั้นจริง
  if (minutes > DOSE_WINDOW_MINUTES) {
    return { minutes, late: true, label: "บันทึกย้อนหลัง" };
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  // เกินหนึ่งชั่วโมงแล้วบอกเป็นนาทีล้วนจะอ่านยาก เช่น "สาย 135 นาที"
  const label =
    hours > 0
      ? `สาย ${hours} ชม.${rest > 0 ? ` ${rest} นาที` : ""}`
      : `สาย ${minutes} นาที`;

  return { minutes, late: true, label };
}
