/**
 * PlanPill - หน้าตาของแต่ละมื้อ (ไอคอน สี และชื่อสั้น)
 *
 * ใช้ร่วมกันทุกที่ที่แสดงมื้ออาหาร (หน้าวันนี้ การ์ดไดอารี่ ประวัติคำเตือน)
 * ให้มื้อเดียวกันหน้าตาเหมือนกันทุกหน้า
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { MealType } from "../types";
import { Period, periodPalette } from "./theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const MEAL_STYLES: Record<MealType, { period: Period; icon: IconName; label: string }> = {
  breakfast: { period: "morning", icon: "coffee-outline", label: "เช้า" },
  lunch: { period: "noon", icon: "food-outline", label: "กลางวัน" },
  dinner: { period: "evening", icon: "silverware-fork-knife", label: "เย็น" },
  snack: { period: "snack", icon: "cookie-outline", label: "ว่าง" },
};

export function mealStyle(type: MealType) {
  const style = MEAL_STYLES[type];
  const palette = periodPalette[style.period];

  return {
    icon: style.icon,
    /** ชื่อสั้นบนป้าย เช่น "เช้า" (การ์ดแคบ ไม่ใช้ "มื้อเช้า") */
    label: style.label,
    color: palette.color,
    background: palette.background,
  };
}
