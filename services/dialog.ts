/**
 * PlanPill - กล่องโต้ตอบที่ทำงานได้ทั้งบนมือถือและบนเว็บ
 *
 * ทุกหน้าจอเรียกผ่านไฟล์นี้ไฟล์เดียว แล้วไฟล์นี้ส่งต่อให้ DialogHost
 * (components/ui/DialogHost.tsx) ซึ่งวาดกล่องเองตามไฟล์ออกแบบ
 *
 * ทำไมไม่ใช้กล่องของระบบ
 *   - Alert.alert ของ react-native-web เป็นฟังก์ชันว่าง (`static alert() {}`) กล่องไม่เคยขึ้น
 *   - window.confirm ของเบราว์เซอร์ถูกบางสภาพแวดล้อมบล็อกไว้ (เช่นหน้าต่างพรีวิวในแอป)
 *     แล้วคืนค่า false ทันที ปุ่มอย่าง "ลบยา" จึงเงียบโดยไม่มีอะไรบอกผู้ใช้
 *   - กล่องของระบบเปลี่ยนสีปุ่มไม่ได้ Build Kit กำหนดให้ปุ่มลบเป็นสีแดงในกล่องยืนยันเท่านั้น
 *
 * ถ้า DialogHost ยังไม่ได้ติดตั้ง (เช่นตอนเปิดแอปครั้งแรกมาก) จะถอยไปใช้กล่องของระบบแทน
 */

import { Alert, Platform } from "react-native";

const isWeb = Platform.OS === "web";

export type DialogButton = {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: "primary" | "danger" | "tertiary" | "tint";
};

export type DialogRequest = {
  title: string;
  message?: string;
  buttons: DialogButton[];
  /** row = ปุ่มเรียงแนวนอน (ยืนยัน/ยกเลิก) · column = เรียงลง (หลายตัวเลือก) */
  layout: "row" | "column";
};

let host: ((request: DialogRequest) => void) | null = null;

/** DialogHost เรียกตอน mount คืนฟังก์ชันสำหรับถอดออก */
export function registerDialogHost(present: (request: DialogRequest) => void) {
  host = present;

  return () => {
    if (host === present) {
      host = null;
    }
  };
}

/**
 * เรียก action โดยไม่ให้ error หลุดออกไปเป็น unhandled rejection
 *
 * ปุ่มในกล่องเป็น fire-and-forget ถ้า action เป็น async แล้วพังขึ้นมา
 * จะไม่มีใครรับ error ต่อ จึงดักไว้ตรงนี้ที่เดียว
 */
export function runDialogAction(action?: () => void | Promise<void>) {
  if (!action) {
    return;
  }

  try {
    const result = action();

    if (result instanceof Promise) {
      result.catch((error) => console.log("การทำงานในกล่องโต้ตอบล้มเหลว:", error));
    }
  } catch (error) {
    console.log("การทำงานในกล่องโต้ตอบล้มเหลว:", error);
  }
}

/** กล่องของระบบ ใช้เฉพาะตอนยังไม่มี DialogHost */
function presentNative(request: DialogRequest) {
  if (isWeb) {
    const body = request.message ? `${request.title}\n\n${request.message}` : request.title;
    const actions = request.buttons.filter((button) => button.variant !== "tertiary");

    if (actions.length <= 1 && request.buttons.length <= 1) {
      window.alert(body);
      runDialogAction(actions[0]?.onPress);
      return;
    }

    for (const action of actions) {
      if (window.confirm(`${body}\n\n[ตกลง = ${action.label}]`)) {
        runDialogAction(action.onPress);
        return;
      }
    }

    return;
  }

  Alert.alert(
    request.title,
    request.message,
    request.buttons.map((button) => ({
      text: button.label,
      style: button.variant === "tertiary" ? "cancel" : button.variant === "danger" ? "destructive" : "default",
      onPress: () => runDialogAction(button.onPress),
    }))
  );
}

function present(request: DialogRequest) {
  if (host) {
    host(request);
  } else {
    presentNative(request);
  }
}

/** แจ้งข้อความอย่างเดียว ไม่มีให้เลือก */
export function showMessage(title: string, message?: string) {
  present({ title, message, layout: "row", buttons: [{ label: "ตกลง", variant: "primary" }] });
}

type ConfirmOptions = {
  title: string;
  message?: string;
  /** ข้อความบนปุ่มยืนยัน ค่าเริ่มต้น "ตกลง" */
  confirmLabel?: string;
  cancelLabel?: string;
  /** true = การกระทำที่ย้อนกลับไม่ได้ เช่นลบข้อมูล ปุ่มยืนยันเป็นสีแดง */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** ถามยืนยันก่อนทำ 1 การกระทำ */
export function confirmAction({
  title,
  message,
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  destructive = false,
  onConfirm,
}: ConfirmOptions) {
  present({
    title,
    message,
    layout: "row",
    buttons: [
      { label: cancelLabel, variant: "tertiary" },
      { label: confirmLabel, variant: destructive ? "danger" : "primary", onPress: onConfirm },
    ],
  });
}

type Choice = {
  label: string;
  onPress: () => void | Promise<void>;
};

type ChooseOptions = {
  title: string;
  message?: string;
  choices: Choice[];
  cancelLabel?: string;
  /**
   * ข้อความที่แสดงแทนบนเว็บ
   *
   * ใส่เมื่อการกระทำนั้นทำบนเว็บไม่ได้อยู่แล้ว (เช่นส่งออกไฟล์ ซึ่งต้องใช้
   * expo-sharing ที่ไม่รองรับเว็บ) บอกตรง ๆ ดีกว่าให้ผู้ใช้เลือกแล้วเจอ error
   */
  webFallbackMessage?: string;
};

/** ให้เลือก 1 อย่างจากหลายตัวเลือก */
export function chooseOption({
  title,
  message,
  choices,
  cancelLabel = "ยกเลิก",
  webFallbackMessage,
}: ChooseOptions) {
  if (isWeb && webFallbackMessage) {
    showMessage(title, webFallbackMessage);
    return;
  }

  present({
    title,
    message,
    layout: "column",
    buttons: [
      ...choices.map((choice) => ({ label: choice.label, variant: "tint" as const, onPress: choice.onPress })),
      { label: cancelLabel, variant: "tertiary" },
    ],
  });
}
