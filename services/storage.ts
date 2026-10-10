/**
 * PlanPill - ชั้นข้อมูล (Supabase + cache ในเครื่อง)
 *
 * ทุกหน้าจอเรียกใช้ไฟล์นี้ไฟล์เดียว ไม่ต้องรู้ว่าข้อมูลมาจากเซิร์ฟเวอร์หรือ cache
 *
 * หลักการทำงาน
 *   อ่าน  → ลองดึงจาก Supabase ก่อน สำเร็จแล้วอัปเดต cache
 *           ถ้าดึงไม่ได้ (ออฟไลน์) คืนค่าจาก cache แทน แอปจึงยังใช้งานได้
 *   เขียน → เขียนลง cache ทันที (ผู้ใช้เห็นผลทันที) แล้วส่งขึ้น Supabase
 *           ถ้าส่งไม่สำเร็จ เก็บงานไว้ในคิว outbox เพื่อส่งซ้ำเมื่อกลับมาออนไลน์
 *
 * การชี้ขาดเมื่อข้อมูลชนกันใช้ last-write-wins ตามที่อธิบายไว้ใน outbox.ts
 */

import { DoseLog, Medication } from "../types";
import { getCurrentUserId } from "./auth";
import {
  clearUserCache,
  readCachedDoseLogs,
  readCachedMedications,
  readHistoryClearedAt,
  writeCachedDoseLogs,
  writeCachedMedications,
  writeHistoryClearedAt,
} from "./cache";
import {
  DOSE_LOG_CONFLICT_TARGET,
  DoseLogRow,
  MedicationRow,
  doseLogFromRow,
  doseLogToRow,
  medicationFromRow,
  medicationToRow,
} from "./mappers";
import { enqueue, flushOutbox } from "./outbox";
import { supabase } from "./supabase";

export { acceptConsent, hasAcceptedConsent } from "./cache";

/** ถ้าไม่มี session แปลว่ายังไม่ได้ล็อกอิน หน้าจอจะถูก auth gate กันไว้อยู่แล้ว */
async function requireUserId() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  }

  return userId;
}

/* ---------------------------------- ยา ---------------------------------- */

export async function getMedications(): Promise<Medication[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const cached = await readCachedMedications(userId);

  const { data, error } = await supabase
    .from("medications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    // ออฟไลน์หรือเซิร์ฟเวอร์มีปัญหา — ใช้ข้อมูลที่ cache ไว้แทน
    return cached;
  }

  // notificationIds เป็นของเฉพาะเครื่อง จึงต้องดึงกลับมาจาก cache ไม่ใช่จากเซิร์ฟเวอร์
  const notificationsById = new Map(
    cached.map((item) => [item.id, item.notificationIds])
  );

  const medications = (data as MedicationRow[]).map((row) =>
    medicationFromRow(row, notificationsById.get(row.id) ?? [])
  );

  await writeCachedMedications(userId, medications);

  return medications;
}

export async function saveMedications(medications: Medication[]) {
  const userId = await requireUserId();
  await writeCachedMedications(userId, medications);
}

export async function getMedicationById(id: string) {
  const medications = await getMedications();
  return medications.find((item) => item.id === id) ?? null;
}

export async function addMedication(medication: Medication) {
  const userId = await requireUserId();
  const cached = await readCachedMedications(userId);
  const updated = [{ ...medication, userId }, ...cached];

  await writeCachedMedications(userId, updated);
  await pushMedication(userId, medication);

  return updated;
}

export async function updateMedication(medication: Medication) {
  const userId = await requireUserId();
  const cached = await readCachedMedications(userId);
  const updated = cached.map((item) =>
    item.id === medication.id ? { ...medication, userId } : item
  );

  await writeCachedMedications(userId, updated);
  await pushMedication(userId, medication);

  return updated;
}

/** ส่งข้อมูลยา 1 รายการขึ้นเซิร์ฟเวอร์ ถ้าไม่สำเร็จให้เข้าคิวไว้ */
async function pushMedication(userId: string, medication: Medication) {
  const row = medicationToRow(medication, userId);
  const { error } = await supabase.from("medications").upsert(row);

  if (error) {
    await enqueue(userId, {
      table: "medications",
      operation: "upsert",
      payload: row,
    });
  }
}

/**
 * เพิ่ม/ลดจำนวนยาคงเหลือ ใช้ตอนผู้ใช้ยืนยันว่ารับประทานแล้ว (delta = -1)
 * ไม่ให้ต่ำกว่า 0 เพื่อไม่ให้ข้อมูลผิดช่วงค่า
 */
export async function adjustMedicationQuantity(
  medicationId: string,
  delta: number
) {
  const userId = await requireUserId();
  const cached = await readCachedMedications(userId);
  const target = cached.find((item) => item.id === medicationId);

  if (!target) {
    return null;
  }

  const updated: Medication = {
    ...target,
    quantity: Math.max(0, target.quantity + delta),
    updatedAt: new Date().toISOString(),
  };

  await writeCachedMedications(
    userId,
    cached.map((item) => (item.id === updated.id ? updated : item))
  );
  await pushMedication(userId, updated);

  return updated;
}

export async function deleteMedication(id: string) {
  const userId = await requireUserId();
  const cached = await readCachedMedications(userId);
  const updated = cached.filter((item) => item.id !== id);

  await writeCachedMedications(userId, updated);

  // ลบประวัติของมื้อที่ยังไม่เกิดขึ้นทิ้งไปด้วย แต่เก็บประวัติที่บันทึกแล้วไว้
  const logs = await readCachedDoseLogs(userId);
  await writeCachedDoseLogs(
    userId,
    logs.filter((log) => log.medicationId !== id || log.takenAt !== null)
  );

  const { error } = await supabase.from("medications").delete().eq("id", id);

  if (error) {
    await enqueue(userId, {
      table: "medications",
      operation: "delete",
      payload: { id },
    });
  }

  return updated;
}

/* -------------------------- ประวัติการรับประทานยา -------------------------- */

export async function getDoseLogs(): Promise<DoseLog[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const cached = await readCachedDoseLogs(userId);

  const { data, error } = await supabase
    .from("dose_logs")
    .select("*")
    .order("scheduled_at", { ascending: false });

  if (error || !data) {
    return cached;
  }

  const logs = (data as DoseLogRow[]).map(doseLogFromRow);

  await writeCachedDoseLogs(userId, logs);

  return logs;
}

export async function saveDoseLogs(logs: DoseLog[]) {
  const userId = await requireUserId();
  await writeCachedDoseLogs(userId, logs);
}

/**
 * บันทึก log ของมื้อยา โดยใช้ id เป็นตัวตรวจว่ามีอยู่แล้วหรือไม่
 * ทำให้ 1 มื้อมีประวัติได้เพียงรายการเดียว (กัน duplicate record)
 */
export async function upsertDoseLog(log: DoseLog) {
  const userId = await requireUserId();
  const logs = await readCachedDoseLogs(userId);
  const index = logs.findIndex((item) => item.id === log.id);

  if (index === -1) {
    logs.push(log);
  } else {
    logs[index] = log;
  }

  await writeCachedDoseLogs(userId, logs);
  await pushDoseLogs(userId, [log]);

  return logs;
}

export async function upsertDoseLogs(newLogs: DoseLog[]) {
  const userId = await requireUserId();
  const logs = await readCachedDoseLogs(userId);

  newLogs.forEach((log) => {
    const index = logs.findIndex((item) => item.id === log.id);

    if (index === -1) {
      logs.push(log);
    } else {
      logs[index] = log;
    }
  });

  await writeCachedDoseLogs(userId, logs);
  await pushDoseLogs(userId, newLogs);

  return logs;
}

/** หาประวัติของมื้อยาหนึ่งมื้อจากสำเนาในเครื่อง null = ยังไม่เคยบันทึก */
export async function findDoseLog(id: string): Promise<DoseLog | null> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return null;
  }

  const logs = await readCachedDoseLogs(userId);
  return logs.find((item) => item.id === id) ?? null;
}

/**
 * ลบประวัติของมื้อยาหนึ่งมื้อ ใช้ตอนผู้ใช้กด "เลิกทำ" กับมื้อที่ไม่เคยมีประวัติมาก่อน
 *
 * ลบด้วยคู่ medication_id + scheduled_at แทน id เพราะ id ฝั่งแอปไม่ใช่ id ของแถวในฐานข้อมูล
 */
export async function removeDoseLog(log: DoseLog) {
  const userId = await requireUserId();
  const logs = await readCachedDoseLogs(userId);

  await writeCachedDoseLogs(
    userId,
    logs.filter((item) => item.id !== log.id)
  );

  const match = {
    user_id: userId,
    medication_id: log.medicationId,
    scheduled_at: log.scheduledAt,
  };

  const { error } = await supabase.from("dose_logs").delete().match(match);

  if (error) {
    await enqueue(userId, { table: "dose_logs", operation: "delete", payload: match });
  }
}

/** ส่งประวัติมื้อยาขึ้นเซิร์ฟเวอร์ ถ้าไม่สำเร็จให้เข้าคิวไว้ทีละรายการ */
async function pushDoseLogs(userId: string, logs: DoseLog[]) {
  if (logs.length === 0) {
    return;
  }

  const rows = logs.map((log) => doseLogToRow(log, userId));

  const { error } = await supabase
    .from("dose_logs")
    .upsert(rows, { onConflict: DOSE_LOG_CONFLICT_TARGET });

  if (error) {
    for (const row of rows) {
      await enqueue(userId, {
        table: "dose_logs",
        operation: "upsert",
        payload: row,
      });
    }
  }
}

/**
 * ล้างประวัติทั้งหมด
 *
 * บันทึกเวลาที่ล้างไว้ด้วย เพราะระบบจะสร้างประวัติของมื้อที่ปิดรอบแล้วขึ้นมาใหม่อัตโนมัติ
 * ถ้าไม่จำเวลาที่ล้าง ประวัติเดิมจะกลับมาทันทีในสถานะ "ไม่ได้บันทึก"
 *
 * เวลาที่ล้างต้องขึ้นเซิร์ฟเวอร์ด้วย (ตาราง user_settings) ไม่ใช่เก็บแค่ในเครื่อง
 * ไม่งั้นล้างที่เครื่องหนึ่งแล้วเปิดอีกเครื่อง ประวัติจะถูกสร้างกลับมาทั้งหมด
 *
 * ลำดับสำคัญ: บันทึกเวลาที่ล้างขึ้นเซิร์ฟเวอร์ "ก่อน" แล้วค่อยลบประวัติ
 * ถ้ากลับกัน จะมีช่วงสั้น ๆ ที่ประวัติถูกลบแล้วแต่เครื่องอื่นยังไม่รู้เวลาที่ล้าง
 * แล้วสร้างประวัติกลับขึ้นมาได้ ถ้าบันทึกเวลาไม่สำเร็จ การลบจึงต้องเข้าคิวตามหลังไปด้วย
 */
export async function clearDoseLogs() {
  const userId = await requireUserId();
  const clearedAt = new Date().toISOString();

  await writeCachedDoseLogs(userId, []);
  await writeHistoryClearedAt(userId, clearedAt);

  const settingsRow = { user_id: userId, history_cleared_at: clearedAt };
  const deleteMatch = { user_id: userId };

  const { error: settingsError } = await supabase
    .from("user_settings")
    .upsert(settingsRow);

  if (settingsError) {
    await enqueue(userId, { table: "user_settings", operation: "upsert", payload: settingsRow });
    await enqueue(userId, { table: "dose_logs", operation: "delete", payload: deleteMatch });
    return;
  }

  const { error } = await supabase.from("dose_logs").delete().match(deleteMatch);

  if (error) {
    await enqueue(userId, { table: "dose_logs", operation: "delete", payload: deleteMatch });
  }
}

/** เวลาที่ใหม่กว่าระหว่างสองค่า (null = ไม่เคยล้าง) */
function laterOf(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * ไม่สร้างประวัติของมื้อที่เกิดก่อนเวลานี้ขึ้นมาใหม่
 *
 * ใช้ค่าที่ "ใหม่กว่า" ระหว่างในเครื่องกับบนเซิร์ฟเวอร์
 *   ในเครื่องใหม่กว่า → เพิ่งล้างตอนออฟไลน์ ยังส่งขึ้นไม่สำเร็จ
 *   เซิร์ฟเวอร์ใหม่กว่า → เพิ่งล้างจากเครื่องอื่น
 *
 * ดึงจากเซิร์ฟเวอร์ไม่ได้ (ออฟไลน์ หรือยังไม่ได้รัน migrate-05) ให้ใช้ค่าในเครื่องแทน
 */
export async function getHistoryClearedAt(): Promise<string | null> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return null;
  }

  const local = await readHistoryClearedAt(userId);

  const { data, error } = await supabase
    .from("user_settings")
    .select("history_cleared_at")
    .maybeSingle();

  if (error) {
    return local;
  }

  const remote = (data?.history_cleared_at as string | null | undefined) ?? null;
  const latest = laterOf(local, remote);

  // จำค่าจากเซิร์ฟเวอร์ไว้ในเครื่อง ตอนออฟไลน์ครั้งถัดไปจะได้ยังกันได้
  if (latest && latest !== local) {
    await writeHistoryClearedAt(userId, new Date(latest).toISOString());
  }

  return latest;
}

/* ------------------------------ การซิงค์ ------------------------------ */

/**
 * ส่งงานที่ค้างในคิวขึ้นเซิร์ฟเวอร์
 *
 * เรียกตอนเปิดแอป เพื่อให้ข้อมูลที่บันทึกไว้ตอนออฟไลน์ถูกอัปโหลดให้เอง
 */
export async function syncPendingWrites() {
  const userId = await getCurrentUserId();

  return userId ? flushOutbox(userId) : 0;
}

/** ลบข้อมูลในเครื่องของผู้ใช้ปัจจุบัน เรียกก่อนออกจากระบบ */
export async function clearLocalData() {
  const userId = await getCurrentUserId();

  if (userId) {
    await clearUserCache(userId);
  }
}
