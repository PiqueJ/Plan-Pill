/**
 * PlanPill - สัญลักษณ์ประจำหมวดอาหาร
 *
 * ช่วยให้หาหมวดเจอเร็วขึ้นโดยไม่ต้องอ่านทุกคำ โดยเฉพาะผู้สูงอายุ
 * ใช้ไอคอน MaterialCommunityIcons แทนอีโมจิ เพราะหน้าตาเหมือนกันทุกเครื่อง
 * (อีโมจิของ iOS Android และเว็บวาดไม่เหมือนกัน บางเครื่องไม่มีบางตัว)
 *
 * สีเป็นของตกแต่งเท่านั้น เลือกตามสีของอาหารจริงให้จำง่าย
 * ความหมาย "อาจตีกับยา" ยังบอกด้วยพื้นชิปสีส้มและเครื่องหมาย ! เหมือนเดิม
 * จึงเลี่ยงส้มสดและแดงในชุดนี้ ไม่ให้ไปปนกับสีเตือน
 *
 * code ต้องตรงกับตาราง food_categories (planpill-schema/migrate-01-ddinter.sql)
 * หมวดใหม่ที่ยังไม่มีในนี้จะได้ไอคอนสำรองแทน ไม่พัง
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ComponentProps } from "react";

export type FoodIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type FoodIcon = {
  icon: FoodIconName;
  /** สีไอคอน */
  color: string;
  /** พื้นวงกลมหลังไอคอน */
  background: string;
};

const FOOD_ICONS: Record<string, FoodIcon> = {
  alcohol: { icon: "glass-wine", color: "#7E22CE", background: "#F3E8FF" },
  grapefruit: { icon: "fruit-citrus", color: "#BE185D", background: "#FCE7F3" },
  citrus: { icon: "fruit-citrus", color: "#A16207", background: "#FEF9C3" },
  dairy: { icon: "cow", color: "#0369A1", background: "#E0F2FE" },
  caffeine: { icon: "coffee", color: "#6B4F3A", background: "#F1E9E1" },
  high_fat: { icon: "french-fries", color: "#92400E", background: "#FEF3C7" },
  high_fiber: { icon: "barley", color: "#4D7C0F", background: "#ECFCCB" },
  oxalate: { icon: "leaf", color: "#15803D", background: "#DCFCE7" },
  potassium: { icon: "food-apple", color: "#0F766E", background: "#CCFBF1" },
  vitamin_k: { icon: "sprout", color: "#166534", background: "#D1FAE5" },
  tyrosine: { icon: "cheese", color: "#A16207", background: "#FEF3C7" },
  soy: { icon: "soy-sauce", color: "#57534E", background: "#F5F5F4" },
  nuts_seeds: { icon: "peanut", color: "#854D0E", background: "#FEF3C7" },
  iodine: { icon: "fish", color: "#1D4ED8", background: "#DBEAFE" },
  photosensitive: { icon: "shield-sun-outline", color: "#A16207", background: "#FEF9C3" },
  with_food: { icon: "silverware-fork-knife", color: "#334155", background: "#E2E8F0" },
  smoking: { icon: "smoking", color: "#475569", background: "#E2E8F0" },
};

const FALLBACK: FoodIcon = { icon: "food-variant", color: "#46505E", background: "#EEF2F6" };

export function foodIcon(code: string): FoodIcon {
  return FOOD_ICONS[code] ?? FALLBACK;
}
