/**
 * PlanPill - ค้นหายาจากฐานข้อมูลอ้างอิง
 *
 * ฐานข้อมูลใช้ชื่อยาแบบอเมริกัน (Acetaminophen) แต่คนไทยพิมพ์ชื่ออื่น
 * (Paracetamol, พาราเซตามอล, พารา, ซาร่า) การค้นหาจึงต้องผ่าน RPC search_drugs
 * ที่ดูทั้งชื่อหลักและตารางชื่อพ้อง แล้วคืนชื่อมาตรฐานกลับมาเสมอ
 *
 * ทำไมต้องให้ผู้ใช้ "เลือก" จากรายการแทนที่จะพิมพ์เอง
 *   ระบบตรวจปฏิกิริยาจับคู่ด้วย drug_id ไม่ใช่ข้อความ
 *   ถ้าผู้ใช้พิมพ์เองแล้วสะกดไม่ตรง ระบบจะตรวจไม่พบปฏิกิริยาแบบเงียบ ๆ
 *   ซึ่งอันตรายกว่าการบอกตรง ๆ ว่าไม่รู้จักยาตัวนี้
 */

import {
  DrugDrugResult,
  DrugSearchResult,
  FoodCategory,
  MealInteractionResult,
  SeverityLevel,
} from "../types";
import { supabase } from "./supabase";

type SearchRow = {
  id: string;
  name_en: string;
  category_th: string | null;
  matched_via: string | null;
  score: number;
};

type MealInteractionRow = {
  medication_name: string;
  food_label_th: string;
  severity: SeverityLevel;
  mechanism_th: string | null;
  management_th: string | null;
  description_en?: string | null;
  management_en?: string | null;
};

type DrugDrugRow = {
  other_name: string;
  severity: SeverityLevel;
  mechanism_th: string | null;
  management_th: string | null;
};

/**
 * ค้นหายาด้วยคำที่ผู้ใช้พิมพ์
 *
 * คืนอาร์เรย์ว่างเมื่อค้นไม่เจอหรือออฟไลน์ ผู้ใช้ยังกรอกชื่อเองต่อได้
 */
export async function searchDrugs(
  query: string,
  limit = 8
): Promise<DrugSearchResult[]> {
  const term = query.trim();

  // สั้นกว่า 2 ตัวอักษรผลลัพธ์จะกว้างเกินไปจนไม่มีประโยชน์
  if (term.length < 2) {
    return [];
  }

  const { data, error } = await supabase.rpc("search_drugs", {
    q: term,
    max_results: limit,
  });

  if (error || !data) {
    console.log("ค้นหายาไม่สำเร็จ:", error?.message);
    return [];
  }

  return (data as SearchRow[]).map((row) => ({
    id: row.id,
    nameEn: row.name_en,
    categoryTh: row.category_th,
    // ฐานข้อมูลที่ยังไม่ได้รัน migrate-02 จะไม่มีคอลัมน์นี้
    // ให้ถอยไปใช้ชื่อหลักแทน ดีกว่าปล่อยให้หน้าจอพังทั้งหน้า
    matchedVia: row.matched_via ?? row.name_en,
    score: row.score,
  }));
}

/**
 * ดึงหมวดอาหารที่ควรเลี่ยงของยาตัวหนึ่ง
 *
 * เรียกตอนผู้ใช้เลือกยาจากรายการ แล้วเก็บผลไว้กับรายการยาเลย
 * (ดูเหตุผลที่เก็บซ้ำแทนการ join สดได้ที่คอมเมนต์ของ Medication.foodRiskCodes)
 */
export async function getFoodRiskCodes(drugId: string): Promise<string[]> {
  // เอาเฉพาะหมวดที่ผู้ใช้ติ๊กได้ในไดอารี่ (selectable = true)
  // จึงตัด with_food และ smoking ออก เพราะไม่ใช่ชนิดอาหาร
  // with_food เป็นเงื่อนไขเรื่องเวลากินยา ซึ่งแสดงแยกผ่าน getMealGuidance อยู่แล้ว
  const { data, error } = await supabase
    .from("drug_food_interactions")
    .select("food_code, food_categories!inner(selectable)")
    .eq("drug_id", drugId)
    .eq("food_categories.selectable", true);

  if (error || !data) {
    console.log("ดึงหมวดอาหารที่ควรเลี่ยงไม่สำเร็จ:", error?.message);
    return [];
  }

  return [...new Set(data.map((row) => row.food_code as string))];
}

/**
 * คำแนะนำเรื่องการกินยาเทียบกับมื้ออาหาร (ถ้าฐานข้อมูลมี)
 *
 * DDInter เก็บเรื่องนี้เป็นหมวดอาหารชื่อ with_food ซึ่งไม่ใช่ชนิดอาหาร
 * แต่เป็นเงื่อนไขว่าควรกินยาพร้อมอาหารหรือตอนท้องว่าง
 * จึงไม่เอาไปปนกับหมวดอาหารที่ผู้ใช้ติ๊กในไดอารี่ แต่เอามาแสดงเป็นคำแนะนำแทน
 *
 * @returns ข้อความภาษาไทย หรือ null ถ้ายาตัวนี้ไม่มีคำแนะนำ
 */
export async function getMealGuidance(drugId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("drug_food_interactions")
    .select("management_th, management_en")
    .eq("drug_id", drugId)
    .eq("food_code", "with_food")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.management_th ?? data.management_en ?? null;
}

/**
 * ตรวจว่ายาที่กำลังจะเพิ่ม ตีกับยาที่ผู้ใช้รับประทานอยู่หรือไม่
 *
 * RPC ฝั่งเซิร์ฟเวอร์กรองด้วย RLS ของผู้เรียกเอง จึงเห็นเฉพาะยาของบัญชีตัวเอง
 * (ดูเหตุผลที่ไม่ใช้ security definer ได้ในคอมเมนต์ของ schema.sql)
 *
 * คืน null เมื่อตรวจไม่ได้ (เช่นออฟไลน์) ซึ่งต่างจากอาร์เรย์ว่างที่แปลว่า
 * ตรวจแล้วไม่พบปฏิกิริยา สองอย่างนี้ต้องแยกกันให้ชัด เพราะถ้ารวมเป็นค่าเดียว
 * แอปจะขึ้นข้อความว่า "ไม่พบปฏิกิริยา" ทั้งที่ยังไม่ได้ตรวจ ซึ่งอันตราย
 *
 * ไม่ว่ากรณีไหนก็ยังบันทึกยาต่อได้ เพราะการบล็อกเพราะเน็ตหลุดสร้างปัญหามากกว่าที่แก้
 */
export async function checkDrugDrug(
  drugId: string
): Promise<DrugDrugResult[] | null> {
  const { data, error } = await supabase.rpc("check_drug_drug", {
    p_drug_id: drugId,
  });

  if (error || !data) {
    console.log("ตรวจปฏิกิริยายา-ยาไม่สำเร็จ:", error?.message);
    return null;
  }

  return (data as DrugDrugRow[]).map((row) => ({
    otherName: row.other_name,
    severity: row.severity,
    mechanismTh: row.mechanism_th,
    managementTh: row.management_th,
  }));
}

/**
 * ตรวจว่าหมวดอาหารในมื้อที่กำลังจะบันทึก ตีกับยาที่ผู้ใช้รับประทานอยู่หรือไม่
 *
 * เหมือน checkDrugDrug คือ RPC ฝั่งเซิร์ฟเวอร์กรองด้วย RLS ของผู้เรียกเอง
 * จึงเห็นเฉพาะยาของบัญชีตัวเอง และคืน null เมื่อตรวจไม่ได้
 * (ตั้งใจให้บันทึกมื้ออาหารต่อได้ ไม่บล็อกเพราะเน็ตหลุด)
 */
export async function checkMealInteractions(
  foodCodes: string[]
): Promise<MealInteractionResult[] | null> {
  if (foodCodes.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc("check_meal_interactions", {
    p_food_codes: foodCodes,
  });

  if (error || !data) {
    console.log("ตรวจปฏิกิริยายา-อาหารไม่สำเร็จ:", error?.message);
    return null;
  }

  return (data as MealInteractionRow[]).map((row) => ({
    medicationName: row.medication_name,
    foodLabelTh: row.food_label_th,
    severity: row.severity,
    mechanismTh: row.mechanism_th,
    managementTh: row.management_th,
    // ฐานข้อมูลที่ยังไม่ได้รัน migrate-03 จะไม่มีสองคอลัมน์นี้
    descriptionEn: row.description_en ?? null,
    managementEn: row.management_en ?? null,
  }));
}

/**
 * หมวดอาหารทั้งหมดที่ผู้ใช้ติ๊กได้ในไดอารี่
 *
 * กรอง selectable = true เพื่อตัด with_food กับ smoking ออก
 * เพราะไม่ใช่ชนิดอาหารที่ผู้ใช้ "กิน" ในมื้อหนึ่ง
 */
export async function getSelectableFoodCategories(): Promise<FoodCategory[]> {
  const { data, error } = await supabase
    .from("food_categories")
    .select("code, label_th, examples_th, sort_order")
    .eq("selectable", true)
    .order("sort_order");

  if (error || !data) {
    console.log("ดึงหมวดอาหารไม่สำเร็จ:", error?.message);
    return [];
  }

  return data.map((row) => ({
    code: row.code as string,
    labelTh: row.label_th as string,
    examplesTh: (row.examples_th as string | null) ?? "",
    sortOrder: row.sort_order as number,
  }));
}

/** ชื่อหมวดอาหารภาษาไทย ใช้แสดงผลคู่กับ code ที่เก็บไว้ */
export async function getFoodCategoryLabels(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("food_categories")
    .select("code, label_th")
    .order("sort_order");

  if (error || !data) {
    return {};
  }

  return Object.fromEntries(
    data.map((row) => [row.code as string, row.label_th as string])
  );
}

export type InteractionDetail = {
  /** เกิดอะไรขึ้น (ภาษาไทยก่อน ถ้ายังไม่แปลใช้ต้นฉบับอังกฤษ) */
  mechanism: string | null;
  /** ควรทำอย่างไร */
  management: string | null;
};

/**
 * รายละเอียดของคู่ยา-อาหาร 1 คู่ ใช้ตอนผู้ใช้แตะคำเตือนในหน้าประวัติ
 *
 * ค้นด้วยชื่อยาและชื่อหมวดอาหาร เพราะคำเตือนที่บันทึกไว้เก็บเป็นข้อความ ไม่ได้เก็บ id
 * คืน null เมื่อค้นไม่ได้ (ออฟไลน์ หรือข้อมูลอ้างอิงเปลี่ยนไปแล้ว)
 */
export async function getFoodInteractionDetail(
  drugName: string,
  foodLabel: string
): Promise<InteractionDetail | null> {
  const { data, error } = await supabase
    .from("drug_food_interactions")
    .select(
      "mechanism_th, management_th, description_en, management_en, drug_reference!inner(name_en), food_categories!inner(label_th)"
    )
    .eq("drug_reference.name_en", drugName)
    .eq("food_categories.label_th", foodLabel)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.log("ดึงรายละเอียดคำเตือนยา-อาหารไม่สำเร็จ:", error?.message);
    return null;
  }

  return {
    mechanism: (data.mechanism_th as string | null) ?? (data.description_en as string | null),
    management: (data.management_th as string | null) ?? (data.management_en as string | null),
  };
}

/**
 * รายละเอียดของคู่ยา-ยา 1 คู่
 *
 * ข้อมูลยา-ยาของ DDInter ส่วนใหญ่มีแค่ระดับความรุนแรง ไม่มีคำอธิบาย
 * หน้าจอต้องรองรับกรณีที่ทั้งสองช่องเป็น null
 */
export async function getDrugInteractionDetail(
  nameA: string,
  nameB: string
): Promise<InteractionDetail | null> {
  const { data: refs, error: refError } = await supabase
    .from("drug_reference")
    .select("id, name_en")
    .in("name_en", [nameA, nameB]);

  if (refError || !refs || refs.length < 2) {
    return null;
  }

  const [first, second] = refs.map((row) => row.id as string);
  const { data, error } = await supabase
    .from("drug_drug_interactions")
    .select("mechanism_th, management_th")
    // เก็บคู่ยาแบบเรียงลำดับไว้ในฐานข้อมูล แต่ถามทั้งสองทางกันพลาด
    .or(`and(drug_a_id.eq.${first},drug_b_id.eq.${second}),and(drug_a_id.eq.${second},drug_b_id.eq.${first})`)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    mechanism: data.mechanism_th as string | null,
    management: data.management_th as string | null,
  };
}
