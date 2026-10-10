/**
 * PlanPill - export ประวัติเป็นไฟล์ (Advanced Feature: Export data เป็น CSV / JSON)
 *
 * เขียนไฟล์ลง cache ของแอปแล้วเปิดหน้าต่างแชร์ของระบบ
 * ผู้ใช้จึงส่งประวัติให้แพทย์หรือผู้ดูแลผ่านแอปใดก็ได้
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { doseStatusMeta } from "../constants/theme";
import { DoseLog, InteractionAlert, severityLabel } from "../types";
import { formatThaiDate, formatTime } from "./schedule";

export type ExportFormat = "csv" | "json";

/** ตัวคั่นบรรทัดของไฟล์ CSV */
const LINE_BREAK = String.fromCharCode(10);

const SOURCE_LABELS: Record<string, string> = {
  manual: "ผู้ใช้บันทึกเอง",
  auto: "ระบบบันทึกอัตโนมัติ",
};

/** ครอบด้วยเครื่องหมายคำพูดและ escape ให้ปลอดภัยกับ CSV */
function toCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(logs: DoseLog[]) {
  const header = [
    "วันที่",
    "เวลาที่กำหนด",
    "เวลาที่ยืนยัน",
    "ส่วนต่างจากเวลาที่กำหนด (นาที)",
    "ชื่อยา",
    "ขนาดที่รับประทาน",
    "สถานะ",
    "ที่มาของข้อมูล",
  ];

  const rows = logs.map((log) => {
    const gapMinutes = log.takenAt
      ? Math.round(
          (new Date(log.takenAt).getTime() -
            new Date(log.scheduledAt).getTime()) /
            60000
        )
      : null;

    return [
      formatThaiDate(log.scheduledAt),
      formatTime(log.scheduledAt),
      log.takenAt ? formatTime(log.takenAt) : "ไม่ได้บันทึก",
      gapMinutes === null ? "ไม่มีข้อมูล" : String(gapMinutes),
      log.medicationName,
      log.dosage || "ไม่ระบุ",
      doseStatusMeta[log.status].label,
      log.source ? SOURCE_LABELS[log.source] ?? log.source : "ไม่มีข้อมูล",
    ]
      .map(toCsvCell)
      .join(",");
  });

  // นำหน้าด้วย BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
  return `﻿${[header.map(toCsvCell).join(","), ...rows].join("\n")}`;
}

const ALERT_KIND_LABELS: Record<InteractionAlert["kind"], string> = {
  drug_food: "ยากับอาหาร",
  drug_drug: "ยากับยา",
};

function alertsToCsv(alerts: InteractionAlert[]) {
  const header = ["วันที่", "เวลา", "ประเภทคำเตือน", "ระดับความรุนแรง", "รายละเอียด"];

  const rows = alerts.map((alert) =>
    [
      formatThaiDate(alert.createdAt),
      formatTime(alert.createdAt),
      ALERT_KIND_LABELS[alert.kind],
      severityLabel[alert.severity],
      alert.messageTh,
    ]
      .map(toCsvCell)
      .join(",")
  );

  // นำหน้าด้วย BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
  return `﻿${[header.map(toCsvCell).join(","), ...rows].join(LINE_BREAK)}`;
}

function buildFileName(format: ExportFormat, now: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `planpill-history-${stamp}.${format}`;
}

function buildAlertFileName(format: ExportFormat, now: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `planpill-alerts-${stamp}.${format}`;
}

/**
 * เขียนไฟล์ลง cache ของแอปแล้วเปิดหน้าต่างแชร์ของระบบ
 *
 * แยกออกมาเป็นฟังก์ชันเพราะทั้งประวัติยาและประวัติคำเตือนใช้ขั้นตอนนี้เหมือนกัน
 */
async function writeAndShare(
  fileName: string,
  content: string,
  format: ExportFormat,
  dialogTitle: string
) {
  const file = new File(Paths.cache, fileName);

  try {
    file.create();
  } catch (error) {
    // ถ้าไฟล์ชื่อนี้มีอยู่แล้วให้เขียนทับได้เลย
    console.log("File already exists, overwriting:", error);
  }

  file.write(content);

  await Sharing.shareAsync(file.uri, {
    mimeType: format === "csv" ? "text/csv" : "application/json",
    dialogTitle,
    UTI: format === "csv" ? "public.comma-separated-values-text" : "public.json",
  });

  return fileName;
}

/**
 * ส่งออกประวัติคำเตือนปฏิกิริยา
 *
 * @returns ชื่อไฟล์ที่สร้าง
 * @throws ถ้าไม่มีข้อมูล หรืออุปกรณ์ไม่รองรับการแชร์ไฟล์ (เช่นบนเว็บ)
 */
export async function exportAlerts(
  alerts: InteractionAlert[],
  format: ExportFormat
) {
  if (alerts.length === 0) {
    throw new Error("ยังไม่มีคำเตือนให้ส่งออก");
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      "อุปกรณ์นี้ไม่รองรับการแชร์ไฟล์ กรุณาลองบนโทรศัพท์แทนการรันบนเว็บ"
    );
  }

  return writeAndShare(
    buildAlertFileName(format, new Date()),
    format === "csv" ? alertsToCsv(alerts) : JSON.stringify(alerts, null, 2),
    format,
    "ส่งออกประวัติคำเตือนปฏิกิริยา"
  );
}

/**
 * ส่งออกประวัติแล้วเปิดหน้าต่างแชร์
 *
 * @returns ชื่อไฟล์ที่สร้าง
 * @throws ถ้าไม่มีข้อมูล หรืออุปกรณ์ไม่รองรับการแชร์ไฟล์ (เช่นบนเว็บ)
 */
export async function exportDoseLogs(logs: DoseLog[], format: ExportFormat) {
  if (logs.length === 0) {
    throw new Error("ยังไม่มีประวัติให้ส่งออก");
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      "อุปกรณ์นี้ไม่รองรับการแชร์ไฟล์ กรุณาลองบนโทรศัพท์แทนการรันบนเว็บ"
    );
  }

  return writeAndShare(
    buildFileName(format, new Date()),
    format === "csv" ? toCsv(logs) : JSON.stringify(logs, null, 2),
    format,
    "ส่งออกประวัติการรับประทานยา"
  );
}
