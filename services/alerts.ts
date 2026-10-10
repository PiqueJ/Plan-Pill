/**
 * PlanPill - ประวัติคำเตือนปฏิกิริยา
 *
 * เก็บว่าระบบเคยเตือนอะไรไปบ้าง เพื่อให้ผู้ใช้ย้อนดูได้ และส่งออกไปให้
 * แพทย์หรือเภสัชกรดูได้ ไม่ใช่เตือนแล้วหายไปกับหน้าจอ
 *
 * หลักการเขียนข้อมูล: คำเตือนของมื้อหนึ่ง (หรือยาหนึ่งรายการ) จะถูก
 * "แทนที่ทั้งชุด" ทุกครั้งที่บันทึก ไม่ใช่เขียนต่อท้ายเรื่อย ๆ
 *   เหตุผล: ถ้าผู้ใช้แก้มื้อเดิมสามรอบ การเขียนต่อท้ายจะได้คำเตือนซ้ำสามชุด
 *   ทั้งที่พูดถึงมื้อเดียวกัน ทำให้ประวัติอ่านไม่รู้เรื่องและนับจำนวนผิด
 *   คำเตือนจึงสะท้อน "สภาพปัจจุบันของมื้อนั้น" เสมอ
 *
 * ใช้รูปแบบ cache-first + outbox เดียวกับ storage.ts และ meals.ts
 */

import { randomUUID } from "expo-crypto";
import {
  DrugDrugResult,
  InteractionAlert,
  MealInteractionResult,
} from "../types";
import { getCurrentUserId } from "./auth";
import { readCachedAlerts, writeCachedAlerts } from "./cache";
import { InteractionAlertRow, alertFromRow, alertToRow } from "./mappers";
import { enqueue } from "./outbox";
import { supabase } from "./supabase";

async function requireUserId() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  }

  return userId;
}

export type ParsedAlert = {
  /** ยาที่ถูกเตือน */
  drug: string;
  /** อีกฝั่งของคู่: หมวดอาหาร (ยา-อาหาร) หรือยาอีกตัว (ยา-ยา) */
  other: string;
  /** ชื่อมื้อที่เก็บไว้ในข้อความ ใช้เมื่อมื้อถูกลบไปแล้ว */
  mealName: string | null;
};

/**
 * แยกข้อความคำเตือนกลับเป็นส่วน ๆ
 *
 * ข้อความเขียนด้วยรูปแบบตายตัวในไฟล์นี้ (recordMealAlerts / recordDrugDrugAlerts)
 *   ยา-อาหาร  "<ยา> กับ <หมวดอาหาร> · มื้อ <ชื่อมื้อ>"
 *   ยา-ยา     "<ยา> ใช้ร่วมกับ <ยาอีกตัว>"
 */
export function parseAlert(alert: InteractionAlert): ParsedAlert {
  if (alert.kind === "drug_drug") {
    const [drug, other = ""] = alert.messageTh.split(" ใช้ร่วมกับ ");
    return { drug: drug.trim(), other: other.trim(), mealName: null };
  }

  const [pair, ...rest] = alert.messageTh.split(" · ");
  const [drug, other = ""] = pair.split(" กับ ");
  const mealPart = rest.join(" · ");

  return {
    drug: drug.trim(),
    other: other.trim(),
    mealName: mealPart.startsWith("มื้อ ") ? mealPart.slice(5).trim() : mealPart.trim() || null,
  };
}

export async function getAlerts(): Promise<InteractionAlert[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const cached = await readCachedAlerts(userId);

  const { data, error } = await supabase
    .from("interaction_alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return cached;
  }

  const alerts = (data as InteractionAlertRow[]).map(alertFromRow);

  await writeCachedAlerts(userId, alerts);

  return alerts;
}

/**
 * เขียนคำเตือนชุดใหม่ทับของเดิมที่ผูกกับสิ่งเดียวกัน
 *
 * @param scope  คอลัมน์ที่ใช้ระบุว่าคำเตือนชุดนี้เป็นของอะไร
 */
async function replaceAlerts(
  scope: { column: "meal_id" | "medication_id"; value: string },
  alerts: InteractionAlert[]
) {
  const userId = await requireUserId();
  const cached = await readCachedAlerts(userId);

  // ตัดของเดิมที่ผูกกับสิ่งนี้ออกจาก cache ก่อน แล้วค่อยใส่ชุดใหม่
  const keyOf = (alert: InteractionAlert) =>
    scope.column === "meal_id" ? alert.mealId : alert.medicationId;

  const kept = cached.filter((alert) => keyOf(alert) !== scope.value);
  const updated = [...alerts, ...kept].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  await writeCachedAlerts(userId, updated);

  const { error: deleteError } = await supabase
    .from("interaction_alerts")
    .delete()
    .eq(scope.column, scope.value);

  if (deleteError) {
    await enqueue(userId, {
      table: "interaction_alerts",
      operation: "delete",
      payload: { [scope.column]: scope.value },
    });
  }

  if (alerts.length === 0) {
    return updated;
  }

  const rows = alerts.map((alert) => alertToRow(alert, userId));
  const { error: insertError } = await supabase
    .from("interaction_alerts")
    .upsert(rows);

  if (insertError) {
    for (const row of rows) {
      await enqueue(userId, {
        table: "interaction_alerts",
        operation: "upsert",
        payload: row,
      });
    }
  }

  return updated;
}

/**
 * บันทึกคำเตือน ยา-อาหาร ของมื้อหนึ่ง
 *
 * เรียกหลังบันทึกมื้อสำเร็จเท่านั้น เพราะคำเตือนอ้าง meal_id
 * ซึ่งมี foreign key ไปที่ตาราง meals
 *
 * ส่งอาร์เรย์ว่างมาได้ ใช้กรณีผู้ใช้แก้มื้อจนไม่เหลือปฏิกิริยาแล้ว
 * ระบบจะลบคำเตือนเดิมของมื้อนั้นทิ้งให้
 */
export async function recordMealAlerts(
  mealId: string,
  mealName: string,
  warnings: MealInteractionResult[]
) {
  const now = new Date().toISOString();

  const alerts: InteractionAlert[] = warnings.map((warning) => ({
    id: randomUUID(),
    mealId,
    medicationId: null,
    kind: "drug_food",
    severity: warning.severity,
    // ข้อความต้องอ่านรู้เรื่องด้วยตัวเอง เพราะไฟล์ที่ส่งออกไม่มีคอลัมน์อื่นให้อ้างอิง
    messageTh: `${warning.medicationName} กับ ${warning.foodLabelTh} · มื้อ ${mealName}`,
    createdAt: now,
  }));

  return replaceAlerts({ column: "meal_id", value: mealId }, alerts);
}

/** บันทึกคำเตือน ยา-ยา ของยารายการหนึ่ง เรียกหลังบันทึกยาสำเร็จ */
export async function recordDrugDrugAlerts(
  medicationId: string,
  medicationName: string,
  conflicts: DrugDrugResult[]
) {
  const now = new Date().toISOString();

  const alerts: InteractionAlert[] = conflicts.map((conflict) => ({
    id: randomUUID(),
    mealId: null,
    medicationId,
    kind: "drug_drug",
    severity: conflict.severity,
    messageTh: `${medicationName} ใช้ร่วมกับ ${conflict.otherName}`,
    createdAt: now,
  }));

  return replaceAlerts({ column: "medication_id", value: medicationId }, alerts);
}

/** ล้างประวัติคำเตือนทั้งหมด */
export async function clearAlerts() {
  const userId = await requireUserId();

  await writeCachedAlerts(userId, []);

  const { error } = await supabase
    .from("interaction_alerts")
    .delete()
    .eq("user_id", userId);

  if (error) {
    await enqueue(userId, {
      table: "interaction_alerts",
      operation: "delete",
      payload: { user_id: userId },
    });
  }
}
