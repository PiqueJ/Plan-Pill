/**
 * PlanPill - คิวงานที่ยังส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ
 *
 * เมื่อผู้ใช้บันทึกข้อมูลตอนไม่มีเน็ต ระบบจะเก็บงานไว้ในคิวนี้
 * แล้วส่งซ้ำให้อัตโนมัติเมื่อกลับมาออนไลน์
 * ตรงกับแผนสำรองที่เขียนไว้ใน proposal ว่า "อัปโหลดซ้ำเมื่อกลับมาออนไลน์"
 *
 * การชี้ขาดเมื่อข้อมูลชนกัน (conflict) ใช้หลักง่ายที่สุดคือ last-write-wins
 * เพราะระบบนี้ผู้ใช้แต่ละคนแก้ข้อมูลของตัวเองจากเครื่องเดียวเป็นหลัก
 * โอกาสที่สองเครื่องแก้แถวเดียวกันพร้อมกันจึงต่ำมาก
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DOSE_LOG_CONFLICT_TARGET } from "./mappers";
import { supabase } from "./supabase";

/** งาน 1 ชิ้นที่รอส่งขึ้นเซิร์ฟเวอร์ */
export type OutboxEntry = {
  id: string;
  table: "medications" | "dose_logs" | "meals" | "interaction_alerts" | "user_settings";
  operation: "upsert" | "delete";
  /** ข้อมูลแถว (upsert) หรือเงื่อนไขที่ใช้ลบ (delete) */
  payload: Record<string, unknown>;
  createdAt: string;
};

function outboxKey(userId: string) {
  return `planpill:${userId}:outbox`;
}

/** จำกัดขนาดคิว กันไม่ให้โตไม่จำกัดถ้าออฟไลน์นาน ๆ */
const MAX_ENTRIES = 200;

export async function readOutbox(userId: string): Promise<OutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch (error) {
    console.log("Error reading outbox:", error);
    return [];
  }
}

async function writeOutbox(userId: string, entries: OutboxEntry[]) {
  try {
    await AsyncStorage.setItem(
      outboxKey(userId),
      JSON.stringify(entries.slice(-MAX_ENTRIES))
    );
  } catch (error) {
    console.log("Error writing outbox:", error);
  }
}

/** เพิ่มงานเข้าคิว ใช้เมื่อเขียนขึ้นเซิร์ฟเวอร์ไม่สำเร็จ */
export async function enqueue(
  userId: string,
  entry: Omit<OutboxEntry, "id" | "createdAt">
) {
  const entries = await readOutbox(userId);

  entries.push({
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });

  await writeOutbox(userId, entries);
}

export async function clearOutbox(userId: string) {
  await AsyncStorage.removeItem(outboxKey(userId));
}

/** ส่งงาน 1 ชิ้นขึ้นเซิร์ฟเวอร์ */
async function sendEntry(entry: OutboxEntry) {
  if (entry.operation === "delete") {
    const { error } = await supabase
      .from(entry.table)
      .delete()
      .match(entry.payload);

    return error;
  }

  const { error } = await supabase.from(entry.table).upsert(entry.payload, {
    // dose_logs ไม่ได้ส่ง id ไป จึงต้องบอกว่าให้ดูคอลัมน์ไหนแทนว่าซ้ำหรือไม่
    onConflict:
      entry.table === "dose_logs" ? DOSE_LOG_CONFLICT_TARGET : undefined,
  });

  return error;
}

/**
 * ส่งงานที่ค้างทั้งหมดขึ้นเซิร์ฟเวอร์ตามลำดับที่บันทึกไว้
 *
 * ถ้าชิ้นไหนส่งไม่สำเร็จเพราะเน็ตยังไม่มา จะหยุดทันทีและเก็บงานที่เหลือไว้
 * เพื่อรักษาลำดับการแก้ไข (เช่น เพิ่มยา ต้องมาก่อน แก้จำนวนยา)
 *
 * @returns จำนวนงานที่ส่งสำเร็จ
 */
export async function flushOutbox(userId: string) {
  const entries = await readOutbox(userId);

  if (entries.length === 0) {
    return 0;
  }

  let sent = 0;

  for (const entry of entries) {
    const error = await sendEntry(entry);

    if (error) {
      // ถ้าเซิร์ฟเวอร์ปฏิเสธข้อมูลชิ้นนี้ การส่งซ้ำก็ไม่มีวันสำเร็จ
      // จึงทิ้งชิ้นนั้นแล้วไปต่อ ไม่ให้คิวค้างถาวรเพราะงานเสียชิ้นเดียว
      if (!isPermanentError(error.code)) {
        break;
      }

      console.log("ข้ามงานที่ส่งไม่ได้ถาวร:", error.code, error.message);
    }

    sent += 1;
  }

  await writeOutbox(userId, entries.slice(sent));

  return sent;
}

/**
 * error นี้ส่งซ้ำไปก็ไม่มีวันสำเร็จหรือไม่
 *
 * ถาวร (ทิ้งแล้วไปต่อ)
 *   22xxx / 23xxx — Postgres ปฏิเสธข้อมูล เช่นผิดรูปแบบ ชนกับ constraint
 *   PGRST1xx      — คำขอผิดรูปแบบ
 *   PGRST2xx      — หาตารางหรือคอลัมน์ไม่เจอ เช่น PGRST205 ตอนยังไม่ได้รัน migration
 *
 * ชั่วคราว (หยุดคิวไว้ส่งรอบหน้า)
 *   ไม่มีรหัส     — เน็ตหลุด ส่งไม่ถึงเซิร์ฟเวอร์เลย
 *   PGRST0xx      — เซิร์ฟเวอร์ต่อฐานข้อมูลไม่ได้ชั่วคราว
 *   PGRST3xx      — token หมดอายุ จะหายเองหลังต่ออายุ
 *   42501         — RLS ปฏิเสธ มักเกิดตอน session หลุด จะผ่านหลังล็อกอินใหม่
 *
 * กลุ่ม PGRST อ้างอิง https://docs.postgrest.org/en/stable/references/errors.html
 */
function isPermanentError(code: unknown) {
  if (typeof code !== "string") {
    return false;
  }

  return code.startsWith("2") || /^PGRST[12]\d\d$/.test(code);
}

/** มีงานค้างอยู่กี่ชิ้น ใช้แสดงในหน้าตั้งค่า */
export async function countPending(userId: string) {
  const entries = await readOutbox(userId);
  return entries.length;
}
