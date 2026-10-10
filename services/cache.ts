/**
 * PlanPill - cache ในเครื่อง
 *
 * เก็บสำเนาข้อมูลล่าสุดไว้ใน AsyncStorage เพื่อให้
 *   1. เปิดแอปแล้วเห็นข้อมูลทันทีแม้เน็ตช้า
 *   2. ใช้งานต่อได้เมื่อออฟไลน์ (ตรงกับแผนสำรองที่เขียนไว้ใน proposal)
 *
 * สำคัญ: cache แยกตาม user id เพราะเครื่องเดียวอาจมีหลายคนสลับกันล็อกอิน
 * ถ้าใช้ key เดียวกันหมด ผู้ใช้คนที่สองจะเห็นข้อมูลของคนแรก
 * ซึ่งจะทำให้ RLS ที่ตั้งไว้อย่างดีเสียเปล่า
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DoseLog, InteractionAlert, Meal, Medication } from "../types";

/** ข้อมูลที่ไม่ผูกกับผู้ใช้คนใดคนหนึ่ง */
const CONSENT_KEY = "planpill_consent_accepted";

type CacheKind =
  | "medications"
  | "dose_logs"
  | "meals"
  | "interaction_alerts"
  | "history_cleared_at";

function cacheKey(userId: string, kind: CacheKind) {
  return `planpill:${userId}:${kind}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.log(`Error loading ${key}:`, error);
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.log(`Error saving ${key}:`, error);
  }
}

/* ------------------------------ ยา ------------------------------ */

export async function readCachedMedications(userId: string) {
  return readJson<Medication[]>(cacheKey(userId, "medications"), []);
}

export async function writeCachedMedications(
  userId: string,
  medications: Medication[]
) {
  await writeJson(cacheKey(userId, "medications"), medications);
}

/* --------------------------- ประวัติมื้อยา --------------------------- */

export async function readCachedDoseLogs(userId: string) {
  return readJson<DoseLog[]>(cacheKey(userId, "dose_logs"), []);
}

export async function writeCachedDoseLogs(userId: string, logs: DoseLog[]) {
  await writeJson(cacheKey(userId, "dose_logs"), logs);
}

/* ------------------------------ มื้ออาหาร ------------------------------ */

export async function readCachedMeals(userId: string) {
  return readJson<Meal[]>(cacheKey(userId, "meals"), []);
}

export async function writeCachedMeals(userId: string, meals: Meal[]) {
  await writeJson(cacheKey(userId, "meals"), meals);
}

/* ------------------------------ คำเตือน ------------------------------ */

export async function readCachedAlerts(userId: string) {
  return readJson<InteractionAlert[]>(cacheKey(userId, "interaction_alerts"), []);
}

export async function writeCachedAlerts(
  userId: string,
  alerts: InteractionAlert[]
) {
  await writeJson(cacheKey(userId, "interaction_alerts"), alerts);
}

/* ------------------------ เวลาที่ล้างประวัติ ------------------------ */

export async function readHistoryClearedAt(userId: string) {
  try {
    return await AsyncStorage.getItem(cacheKey(userId, "history_cleared_at"));
  } catch (error) {
    console.log("Error loading history cleared time:", error);
    return null;
  }
}

export async function writeHistoryClearedAt(userId: string, value: string) {
  await AsyncStorage.setItem(cacheKey(userId, "history_cleared_at"), value);
}

/* --------------------------- consent --------------------------- */

export async function hasAcceptedConsent() {
  const value = await AsyncStorage.getItem(CONSENT_KEY);
  return value === "true";
}

export async function acceptConsent() {
  await AsyncStorage.setItem(CONSENT_KEY, "true");
}

/* --------------------------- เก็บกวาด --------------------------- */

/**
 * ลบ cache ของผู้ใช้คนหนึ่งทิ้ง
 *
 * เรียกตอนออกจากระบบ เพื่อไม่ให้ข้อมูลค้างอยู่ในเครื่องที่อาจมีคนอื่นใช้ต่อ
 * ไม่ลบ consent เพราะเป็นการรับทราบของเจ้าของเครื่อง ไม่ใช่ของบัญชี
 */
export async function clearUserCache(userId: string) {
  try {
    await AsyncStorage.multiRemove([
      cacheKey(userId, "medications"),
      cacheKey(userId, "dose_logs"),
      cacheKey(userId, "meals"),
      cacheKey(userId, "interaction_alerts"),
      cacheKey(userId, "history_cleared_at"),
    ]);
  } catch (error) {
    console.log("Error clearing user cache:", error);
  }
}
