/**
 * PlanPill - Supabase client
 *
 * ตั้งค่าตามเอกสารทางการของ Supabase สำหรับ Expo React Native
 * https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
 *
 * คีย์ที่ใช้คือ publishable key (ชื่อเดิม anon key) ซึ่ง "ปลอดภัยที่จะฝังในแอป"
 * เพราะความปลอดภัยจริงมาจาก Row Level Security ที่ตั้งไว้ใน schema.sql
 * ห้ามนำ service_role key มาใส่ในแอปเด็ดขาด เพราะคีย์นั้นข้าม RLS ได้ทั้งหมด
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // แจ้งให้ชัดตั้งแต่ตอนเปิดแอป ดีกว่าปล่อยให้ทุก query fail แบบไม่รู้สาเหตุ
  console.warn(
    "ยังไม่ได้ตั้งค่า Supabase — คัดลอก .env.example เป็น .env แล้วใส่ค่าจาก Supabase Dashboard"
  );
}

/**
 * ตอน Expo Router สร้างหน้าเว็บแบบ static (output: "static" ใน app.json)
 * โค้ดนี้จะถูกรันใน Node ซึ่งไม่มี `window`
 *
 * supabase-js จะอ่าน session จาก storage ทันทีที่สร้าง client
 * ถ้าส่ง AsyncStorage เข้าไปตอนนั้น จะพังด้วย "ReferenceError: window is not defined"
 * เพราะ AsyncStorage บนเว็บทำงานบน window.localStorage
 *
 * ใน React Native ตัวจริง `window` มีอยู่ เงื่อนไขนี้จึงเป็นจริงเฉพาะตอน SSR เท่านั้น
 * และตอน SSR ไม่ต้องเก็บ session อยู่แล้ว เพราะยังไม่มีผู้ใช้
 */
const isServerRendering = typeof window === "undefined";

export const supabase = createClient(supabaseUrl ?? "", supabaseKey ?? "", {
  auth: {
    // เก็บ session ไว้ในเครื่อง ผู้ใช้จึงไม่ต้องล็อกอินใหม่ทุกครั้งที่เปิดแอป
    storage: isServerRendering ? undefined : AsyncStorage,
    autoRefreshToken: !isServerRendering,
    persistSession: !isServerRendering,
    // ปิดไว้เพราะ React Native ไม่มี URL ให้ตรวจ session แบบเว็บ
    detectSessionInUrl: false,
  },
});

/**
 * ต่ออายุ token อัตโนมัติเฉพาะตอนแอปอยู่หน้าจอ
 *
 * ถ้าไม่หยุดตอนแอปลงพื้นหลัง timer จะยังทำงานและเปลืองแบตโดยไม่จำเป็น
 *
 * ผูกเฉพาะบนมือถือ เพราะโค้ดส่วนนี้ทำงานตอน import
 * ซึ่ง Expo Router จะ import ตอน server-side render ของเว็บด้วย
 * และ AppState ใช้ไม่ได้ในบริบท Node จนทำให้ dev server ล้ม
 */
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

/** ตรวจว่าตั้งค่า Supabase ครบหรือยัง ใช้ตัดสินใจว่าจะทำงานแบบออฟไลน์ล้วนหรือไม่ */
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}
