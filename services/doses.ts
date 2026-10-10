/**
 * PlanPill - การบันทึกผลของแต่ละมื้อยา
 *
 * รวมขั้นตอนที่ต้องทำทุกครั้งที่ผู้ใช้ยืนยันหรือข้ามมื้อไว้ที่เดียว
 * เพื่อให้ผลลัพธ์เหมือนกันเสมอไม่ว่าจะกดจากหน้าไหน
 *
 *   บันทึกลงประวัติ → ตัดจำนวนยาคงเหลือ 1 เม็ด (เฉพาะตอนยืนยันว่ารับประทาน)
 *
 * ข้อจำกัด: ระบบบันทึกจากการกดของผู้ใช้เท่านั้น ไม่มีอุปกรณ์ตรวจสอบ
 * จึงไม่สามารถยืนยันได้ว่าผู้ใช้รับประทานยาจริงตามที่บันทึก
 */

import { DoseLog, Medication } from "../types";
import {
  adjustMedicationQuantity,
  findDoseLog,
  removeDoseLog,
  upsertDoseLog,
} from "./storage";

export type DoseRecordResult = {
  dose: DoseLog;
  /** ข้อมูลยาหลังตัดจำนวนแล้ว ใช้เช็คว่ายาใกล้หมดหรือไม่ (null = ไม่ได้ตัดจำนวน) */
  medication: Medication | null;
  /**
   * ประวัติของมื้อนี้ก่อนกด ใช้ตอน "เลิกทำ"
   * null = มื้อนี้ยังไม่เคยมีประวัติ การเลิกทำจึงต้องลบทิ้ง ไม่ใช่เขียนทับ
   */
  previous: DoseLog | null;
};

/**
 * ผู้ใช้ยืนยันว่ารับประทานยามื้อนี้แล้ว
 *
 * ถ้ามื้อนี้เคยยืนยันไปแล้วจะไม่ตัดจำนวนยาซ้ำ (กันกดปุ่มรัว)
 */
export async function recordDoseTaken(
  dose: DoseLog,
  timestamp = new Date()
): Promise<DoseRecordResult> {
  const alreadyTaken = dose.takenAt !== null;
  const previous = await findDoseLog(dose.id);

  const updatedDose: DoseLog = {
    ...dose,
    takenAt: alreadyTaken ? dose.takenAt : timestamp.toISOString(),
    source: "manual",
    status: "taken",
  };

  await upsertDoseLog(updatedDose);

  const medication = alreadyTaken
    ? null
    : await adjustMedicationQuantity(dose.medicationId, -1);

  return { dose: updatedDose, medication, previous };
}

/**
 * ผู้ใช้กดข้ามมื้อนี้
 *
 * ไม่ตัดจำนวนยาคงเหลือ และแยกออกจาก "missed" ให้ชัด
 * เพราะ skipped คือผู้ใช้ตั้งใจข้าม ส่วน missed คือเลยเวลาไปเฉย ๆ
 */
export async function skipDose(dose: DoseLog): Promise<DoseRecordResult> {
  const previous = await findDoseLog(dose.id);
  const updatedDose: DoseLog = {
    ...dose,
    takenAt: null,
    source: "manual",
    status: "skipped",
  };

  await upsertDoseLog(updatedDose);

  return { dose: updatedDose, medication: null, previous };
}

/**
 * เลิกทำการบันทึกล่าสุด (แถบ "เลิกทำ" 6 วินาที)
 *
 * คืนประวัติกลับเป็นแบบก่อนกด และคืนยาที่ตัดไป 1 เม็ด
 * ถ้าก่อนกดยังไม่มีประวัติ ให้ลบทิ้ง จะได้ไม่เหลือแถวค้างในสถานะกลาง ๆ
 */
export async function undoDoseRecord(result: DoseRecordResult) {
  if (result.previous) {
    await upsertDoseLog(result.previous);
  } else {
    await removeDoseLog(result.dose);
  }

  if (result.medication) {
    await adjustMedicationQuantity(result.dose.medicationId, 1);
  }
}
