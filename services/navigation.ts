/**
 * PlanPill - เปิดหน้าของ tab อื่น แล้วปิดกลับมาที่เดิม
 *
 * ปัญหาเดิม: กด "ดูมื้อนี้" จากหน้าประวัติ แล้วกด ✕
 *   - กลับไปหน้าวันนี้ (tab แรก) แทนที่จะกลับหน้าประวัติที่เพิ่งดูอยู่
 *   - tab อาหารค้างอยู่ที่ฟอร์มแก้ไขมื้อนั้น กด tab อาหารครั้งถัดไปเลยเจอฟอร์มแทนไดอารี่
 *
 * วิธีแก้:
 *   - เปิดด้วย withAnchor ให้ stack ของ tab ปลายทางมีหน้าแรกของ tab (anchor) อยู่ข้างใต้เสมอ
 *   - แนบ returnTo = tab ต้นทาง ตอนปิดจะเอาหน้าซ้อนออกก่อน (tab ปลายทางกลับไปหน้าแรก)
 *     แล้วค่อยพากลับ tab ต้นทาง
 */

import { Href, router } from "expo-router";

/** หน้าแรกของแต่ละ tab ที่พากลับไปได้ */
export type ReturnTo = "/" | "/history" | "/meals" | "/medications";

const RETURN_TARGETS: ReturnTo[] = ["/", "/history", "/meals", "/medications"];

/** ชื่อ tab ต้นทาง ใช้เป็นป้ายปุ่มย้อนกลับ เช่น "‹ วันนี้" */
export const RETURN_LABEL: Record<ReturnTo, string> = {
  "/": "วันนี้",
  "/history": "ประวัติ",
  "/meals": "ไดอารี่อาหาร",
  "/medications": "ยาของฉัน",
};

/** อ่าน returnTo จาก params ของหน้า รับเฉพาะค่าที่รู้จัก กันลิงก์แปลก ๆ พาไปหน้าอื่น */
export function parseReturnTo(value: string | string[] | undefined): ReturnTo | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return RETURN_TARGETS.find((item) => item === raw) ?? null;
}

/**
 * เปิดหน้าซ้อนของ tab อื่น เช่น เปิดฟอร์มแก้มื้อจากหน้าประวัติ
 *
 * @param pathname เส้นทางแบบมีช่องตัวแปร เช่น "/(tabs)/meals/edit/[mealId]"
 * @param returnTo tab ที่กำลังอยู่ ให้ปุ่มปิดพากลับมาที่นี่
 */
export function openFromTab(pathname: string, returnTo: ReturnTo, params: Record<string, string> = {}) {
  router.push({ pathname, params: { ...params, returnTo } } as Href, { withAnchor: true });
}

/**
 * ปิดหน้าซ้อน (ปุ่ม ✕ ปุ่มย้อนกลับ และหลังบันทึกหรือลบสำเร็จ)
 *
 * เอาหน้าซ้อนออกจาก stack ของ tab นี้ก่อนเสมอ แล้วถ้าเปิดมาจาก tab อื่นค่อยพากลับไป
 */
export function closeNested(returnTo: ReturnTo | null, fallback: ReturnTo) {
  if (router.canDismiss()) {
    router.dismiss();
  } else if (!returnTo) {
    router.navigate(fallback as Href);
  }

  if (returnTo) {
    router.navigate(returnTo as Href);
  }
}
