/**
 * PlanPill - local notification (Advanced Feature: Notification / automated alert)
 *
 * ใช้ expo-notifications ตั้งการแจ้งเตือนแบบ DAILY ตามเวลาที่ผู้ใช้กรอกไว้ในแต่ละรายการยา
 * local notification ใช้งานได้ใน Expo Go (SDK 54) จึงสาธิตได้จริงในวัน Live Demo
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Medication } from "../types";
import { getMedications, updateMedication } from "./storage";

export const REMINDER_CHANNEL_ID = "medication-reminders";

/** เลื่อนการแจ้งเตือนออกไปกี่นาทีเมื่อผู้ใช้กด "เลื่อน 15 นาที" (ตามไฟล์ออกแบบ Sky) */
export const SNOOZE_MINUTES = 15;

/** เรียกครั้งเดียวตอนแอปเริ่มทำงาน กำหนดว่าจะแสดงการแจ้งเตือนอย่างไรขณะเปิดแอปอยู่ */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Android ต้องสร้าง channel ก่อน การแจ้งเตือนจึงจะเด้งขึ้นมาแบบ heads-up */
export async function setupNotificationChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: "การแจ้งเตือนรับประทานยา",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (error) {
    console.log("Error creating notification channel:", error);
  }
}

export async function requestNotificationPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();

    if (current.granted) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return requested.granted;
  } catch (error) {
    console.log("Error requesting notification permission:", error);
    return false;
  }
}

/**
 * ตั้งการแจ้งเตือนรายวันของยา 1 รายการ (1 เวลา = 1 notification)
 * คืนค่าเป็น id ทั้งหมด เพื่อเก็บไว้ใน medication.notificationIds สำหรับยกเลิกภายหลัง
 */
export async function scheduleMedicationReminders(
  medication: Omit<Medication, "notificationIds">
) {
  const ids: string[] = [];

  for (const time of medication.reminderTimes) {
    const [hour, minute] = time.split(":").map(Number);

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "ถึงเวลารับประทานยา",
          body: `${medication.name} ${medication.dosage}`,
          data: { medicationId: medication.id, reminderTime: time },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: REMINDER_CHANNEL_ID,
        },
      });

      ids.push(id);
    } catch (error) {
      console.log(`Error scheduling reminder at ${time}:`, error);
    }
  }

  return ids;
}

export async function cancelMedicationReminders(notificationIds: string[]) {
  for (const id of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (error) {
      console.log("Error cancelling reminder:", error);
    }
  }
}

/** ใช้ตอนแก้ไขยา: ยกเลิกของเดิมทั้งหมดแล้วตั้งใหม่ตามเวลาที่แก้ */
export async function rescheduleMedicationReminders(
  medication: Medication,
  previousIds: string[]
) {
  await cancelMedicationReminders(previousIds);

  return scheduleMedicationReminders(medication);
}

/**
 * พักการเตือนหรือเปิดการเตือนของยา 1 รายการ
 *
 * ยาที่พักไว้ยังอยู่ในรายการและเก็บประวัติเดิมไว้ แต่ไม่เตือนและไม่สร้างมื้อใหม่
 * ถ้าเปิดกลับแล้วไม่ได้รับสิทธิ์แจ้งเตือน ยาจะกลับมาอยู่ในตารางแต่ไม่มีเสียงเตือน
 *
 * @returns ข้อมูลยาหลังเปลี่ยน และบอกว่าตั้งการแจ้งเตือนได้จริงหรือไม่
 */
export async function setMedicationActive(medication: Medication, active: boolean) {
  await cancelMedicationReminders(medication.notificationIds);

  let notificationIds: string[] = [];
  let remindersScheduled = false;

  if (active && Platform.OS !== "web") {
    const granted = await requestNotificationPermission();

    if (granted) {
      notificationIds = await scheduleMedicationReminders(medication);
      remindersScheduled = notificationIds.length > 0;
    }
  }

  const now = new Date().toISOString();
  const updated: Medication = {
    ...medication,
    status: active ? "active" : "paused",
    notificationIds,
    // เปิดกลับวันนี้ต้องไม่ทำให้มื้อระหว่างที่พักไว้กลายเป็น "ไม่ได้บันทึก"
    remindersUpdatedAt: active ? now : medication.remindersUpdatedAt,
    updatedAt: now,
  };

  await updateMedication(updated);

  return { medication: updated, remindersScheduled };
}

/** ใช้ในหน้าตั้งค่าเพื่อยืนยันว่ามีการแจ้งเตือนถูกตั้งไว้จริง */
export async function countScheduledNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length;
  } catch (error) {
    console.log("Error reading scheduled notifications:", error);
    return 0;
  }
}

export type PermissionStatus = "granted" | "denied" | "undetermined";

export async function getNotificationPermissionStatus(): Promise<PermissionStatus> {
  try {
    const settings = await Notifications.getPermissionsAsync();

    if (settings.granted) {
      return "granted";
    }

    return settings.canAskAgain ? "undetermined" : "denied";
  } catch (error) {
    console.log("Error reading notification permission:", error);
    return "denied";
  }
}

/**
 * เตือนซ้ำในอีก N นาที (one-off)
 * ใช้เมื่อผู้ใช้ได้รับการแจ้งเตือนแล้วแต่ยังไม่สะดวกรับประทานยาตอนนี้
 */
export async function scheduleSnoozeReminder(
  medication: Pick<Medication, "name" | "dosage">,
  minutes: number
) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "เตือนอีกครั้ง: ถึงเวลารับประทานยา",
        body: `${medication.name} ${medication.dosage}`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: minutes * 60,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  } catch (error) {
    console.log("Error scheduling snooze reminder:", error);
    return null;
  }
}

/**
 * ตรวจว่าการแจ้งเตือนของยาที่เปิดใช้งานอยู่ยังถูกตั้งไว้ครบหรือไม่ ถ้าหายไปให้ตั้งใหม่
 *
 * เรียกตอนเปิดแอป เพราะการแจ้งเตือนที่ตั้งไว้อาจหายได้ เช่น ผู้ใช้ล้างข้อมูลแอป
 * ติดตั้งแอปใหม่ หรือระบบปฏิบัติการล้าง scheduled notification ทิ้ง
 *
 * @returns จำนวนรายการยาที่ต้องตั้งการแจ้งเตือนใหม่
 */
export async function syncMedicationNotifications() {
  if (Platform.OS === "web") {
    return 0;
  }

  const permission = await Notifications.getPermissionsAsync();

  if (!permission.granted) {
    return 0;
  }

  const medications = await getMedications();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledIds = new Set(scheduled.map((item) => item.identifier));

  // ยกเลิกการเตือนของยาที่ไม่มีอยู่แล้วหรือพักไว้ เช่น ลบจากอีกเครื่อง หรือรันชุดข้อมูลเดโมใหม่
  // (ยาทุกตัวได้ id ใหม่) ไม่งั้นเครื่องจะเตือนยาเก่าซ้อนกับยาใหม่
  // การเตือนซ้ำที่ผู้ใช้กดเลื่อนไว้ไม่มี medicationId จึงไม่ถูกแตะ
  const activeIds = new Set(medications.filter((item) => item.status === "active").map((item) => item.id));

  for (const item of scheduled) {
    const medicationId = item.content.data?.medicationId;

    if (typeof medicationId === "string" && !activeIds.has(medicationId)) {
      await cancelMedicationReminders([item.identifier]);
    }
  }

  let repaired = 0;

  for (const medication of medications) {
    if (medication.status !== "active") {
      continue;
    }

    const isMissing =
      medication.notificationIds.length !== medication.reminderTimes.length ||
      medication.notificationIds.some((id) => !scheduledIds.has(id));

    if (!isMissing) {
      continue;
    }

    await cancelMedicationReminders(medication.notificationIds);

    const notificationIds = await scheduleMedicationReminders(medication);

    await updateMedication({ ...medication, notificationIds });

    repaired += 1;
  }

  return repaired;
}
