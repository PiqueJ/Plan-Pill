/**
 * PlanPill - จำว่ามื้อยาไหนถูกเลื่อนการเตือนไว้ถึงกี่โมง
 *
 * บนมือถือ ระบบปฏิบัติการเป็นคนเตือนตามเวลาที่ตั้งไว้ แต่บนเว็บไม่มีการแจ้งเตือนของระบบ
 * แอปจึงต้องจำเวลาที่เลื่อนไว้เอง แล้วเด้งเตือนบนหน้าจอเมื่อถึงเวลา
 * เก็บลง AsyncStorage (localStorage บนเว็บ) รีเฟรชหน้าแล้วยังจำได้
 *
 * ทั้งสองแพลตฟอร์มใช้ข้อมูลนี้แสดงว่า "เลื่อนแล้ว · เตือนอีกครั้ง 14:45"
 * และกันไม่ให้กดเลื่อนซ้ำจนการเตือนซ้อนกันหลายอัน
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const SNOOZES_KEY = "planpill_snoozes";

/** ทิ้งรายการที่เลยเวลามานานแล้ว ไฟล์จะได้ไม่โตขึ้นเรื่อย ๆ */
const KEEP_MS = 24 * 60 * 60 * 1000;

/** doseId → เวลาที่จะเตือนอีกครั้ง (ISO) */
export type Snoozes = Record<string, string>;

export async function getSnoozes(): Promise<Snoozes> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZES_KEY);
    const saved: Snoozes = raw ? JSON.parse(raw) : {};
    const cutoff = Date.now() - KEEP_MS;

    return Object.fromEntries(Object.entries(saved).filter(([, until]) => new Date(until).getTime() > cutoff));
  } catch {
    return {};
  }
}

async function saveSnoozes(snoozes: Snoozes) {
  try {
    await AsyncStorage.setItem(SNOOZES_KEY, JSON.stringify(snoozes));
  } catch (error) {
    console.log("Error saving snoozes:", error);
  }
}

/** บันทึกว่ามื้อนี้เลื่อนไป minutes นาที คืนเวลาที่จะเตือนอีกครั้ง */
export async function addSnooze(doseId: string, minutes: number) {
  const until = new Date(Date.now() + minutes * 60 * 1000);
  const snoozes = await getSnoozes();

  snoozes[doseId] = until.toISOString();
  await saveSnoozes(snoozes);

  return until;
}

export async function clearSnooze(doseId: string) {
  const snoozes = await getSnoozes();

  if (snoozes[doseId]) {
    delete snoozes[doseId];
    await saveSnoozes(snoozes);
  }
}

/** มื้อนี้ยังอยู่ในช่วงที่เลื่อนไว้หรือไม่ (ยังไม่ถึงเวลาเตือนอีกครั้ง) */
export function snoozedUntil(snoozes: Snoozes, doseId: string, now: Date) {
  const until = snoozes[doseId];
  return until && new Date(until).getTime() > now.getTime() ? new Date(until) : null;
}

/** มื้อที่ถึงเวลาเตือนอีกครั้งแล้ว (ใช้บนเว็บ ที่ไม่มีระบบแจ้งเตือนมาเตือนให้) */
export function dueSnoozes(snoozes: Snoozes, now: Date) {
  return Object.entries(snoozes)
    .filter(([, until]) => new Date(until).getTime() <= now.getTime())
    .map(([doseId]) => doseId);
}

/**
 * บนเว็บ ถ้าเบราว์เซอร์อนุญาต ให้เด้งการแจ้งเตือนของเบราว์เซอร์ด้วย ผู้ใช้จะเห็นแม้สลับไปแท็บอื่น
 * ขออนุญาตตอนผู้ใช้กดเลื่อน (เบราว์เซอร์ให้ขอได้เฉพาะตอนผู้ใช้กดอะไรบางอย่าง)
 */
export async function requestBrowserNotification() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    new Notification(title, { body });
  } catch (error) {
    console.log("Error showing browser notification:", error);
  }
}
