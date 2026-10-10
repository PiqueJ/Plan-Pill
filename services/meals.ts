/**
 * PlanPill - ไดอารี่มื้ออาหาร
 *
 * ใช้หลักการเดียวกับ services/storage.ts ทุกอย่าง
 *   อ่าน  → ลอง Supabase ก่อน ล้มเหลวค่อยใช้ cache
 *   เขียน → ลง cache ทันที แล้วส่งขึ้นเซิร์ฟเวอร์ ถ้าไม่สำเร็จเข้าคิว outbox
 *
 * แยกเป็นคนละไฟล์กับ storage.ts เพราะไดอารี่อาหารเป็นคนละโดเมนกับการเตือนกินยา
 * ถ้ารวมไว้ไฟล์เดียวจะยาวเกินจนหาของยาก
 */

import { Meal } from "../types";
import { getCurrentUserId } from "./auth";
import { readCachedMeals, writeCachedMeals } from "./cache";
import { MealRow, mealFromRow, mealToRow } from "./mappers";
import { enqueue } from "./outbox";
import { deleteMealPhoto } from "./photos";
import { supabase } from "./supabase";

async function requireUserId() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  }

  return userId;
}

/** เรียงจากมื้อล่าสุดไปเก่าสุด ให้ตรงกับที่หน้าไดอารี่แสดง */
function sortByEatenAtDesc(meals: Meal[]) {
  return [...meals].sort((a, b) => b.eatenAt.localeCompare(a.eatenAt));
}

export async function getMeals(): Promise<Meal[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const cached = await readCachedMeals(userId);

  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .order("eaten_at", { ascending: false });

  if (error || !data) {
    // ออฟไลน์ — ยังเปิดดูไดอารี่ย้อนหลังได้จากสำเนาในเครื่อง
    return cached;
  }

  const meals = (data as MealRow[]).map(mealFromRow);

  await writeCachedMeals(userId, meals);

  return meals;
}

export async function getMealById(id: string) {
  const meals = await getMeals();
  return meals.find((item) => item.id === id) ?? null;
}

export async function addMeal(meal: Meal) {
  const userId = await requireUserId();
  const cached = await readCachedMeals(userId);
  const updated = sortByEatenAtDesc([{ ...meal, userId }, ...cached]);

  await writeCachedMeals(userId, updated);
  await pushMeal(userId, meal);

  return updated;
}

export async function updateMeal(meal: Meal) {
  const userId = await requireUserId();
  const cached = await readCachedMeals(userId);
  const updated = sortByEatenAtDesc(
    cached.map((item) => (item.id === meal.id ? { ...meal, userId } : item))
  );

  await writeCachedMeals(userId, updated);
  await pushMeal(userId, meal);

  return updated;
}

export async function deleteMeal(id: string) {
  const userId = await requireUserId();
  const cached = await readCachedMeals(userId);
  const target = cached.find((item) => item.id === id);
  const updated = cached.filter((item) => item.id !== id);

  await writeCachedMeals(userId, updated);

  // ลบรูปทิ้งด้วย ไม่งั้นจะเหลือไฟล์กำพร้าใน Storage ที่ไม่มีอะไรอ้างถึงอีกเลย
  if (target?.photoPath) {
    await deleteMealPhoto(target.photoPath);
  }

  const { error } = await supabase.from("meals").delete().eq("id", id);

  if (error) {
    await enqueue(userId, {
      table: "meals",
      operation: "delete",
      payload: { id },
    });
  }

  return updated;
}

/** ส่งมื้ออาหาร 1 รายการขึ้นเซิร์ฟเวอร์ ถ้าไม่สำเร็จให้เข้าคิวไว้ */
async function pushMeal(userId: string, meal: Meal) {
  const row = mealToRow(meal, userId);
  const { error } = await supabase.from("meals").upsert(row);

  if (error) {
    await enqueue(userId, {
      table: "meals",
      operation: "upsert",
      payload: row,
    });
  }
}
