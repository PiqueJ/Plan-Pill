/**
 * PlanPill - authentication
 *
 * ห่อการเรียก Supabase Auth ไว้ที่เดียว เพื่อให้หน้าจอไม่ต้องรู้จัก supabase client โดยตรง
 * และแปลข้อความ error เป็นภาษาไทยจากที่เดียว
 *
 * ใช้อีเมลหรือชื่อผู้ใช้ + รหัสผ่าน ไม่ใช้ OAuth เพราะต้องตั้งค่า deep link เพิ่ม
 * ซึ่งเกินความจำเป็นของระบบต้นแบบ
 *
 * ชื่อผู้ใช้: Supabase Auth รับแค่อีเมล จึงแปลงชื่อผู้ใช้เป็นอีเมลภายใน
 * "somchai_99" → "somchai_99@users.planpill.app" ผู้ใช้ไม่เคยเห็นอีเมลนี้
 * ต้องปิด Confirm email ในโปรเจกต์ Supabase ไว้ ไม่งั้นระบบจะพยายามส่งอีเมลยืนยันไปที่อยู่ที่ไม่มีจริง
 */

import { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** รหัสผ่านขั้นต่ำตามค่าเริ่มต้นของ Supabase */
export const MIN_PASSWORD_LENGTH = 6;

/** โดเมนของอีเมลภายในสำหรับบัญชีที่สมัครด้วยชื่อผู้ใช้ */
const USERNAME_DOMAIN = "users.planpill.app";

/** ชื่อผู้ใช้: a-z 0-9 _ . ยาว 3–20 ตัว ขึ้นต้นด้วยตัวอักษร */
const USERNAME_PATTERN = /^[a-z][a-z0-9_.]{2,19}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ช่องเดียวรับได้ทั้งอีเมลและชื่อผู้ใช้ มี @ = อีเมล */
export function isEmailIdentifier(identifier: string) {
  return identifier.includes("@");
}

/** แปลงสิ่งที่ผู้ใช้พิมพ์เป็นอีเมลที่ส่งให้ Supabase (ชื่อผู้ใช้ไม่สนตัวพิมพ์เล็กใหญ่) */
export function toAuthEmail(identifier: string) {
  const value = identifier.trim();
  return isEmailIdentifier(value) ? value : `${value.toLowerCase()}@${USERNAME_DOMAIN}`;
}

/** สิ่งที่แสดงให้ผู้ใช้เห็น บัญชีชื่อผู้ใช้แสดงชื่อผู้ใช้ ไม่แสดงอีเมลภายใน */
export function displayIdentifier(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -(USERNAME_DOMAIN.length + 1)) : email;
}

export type AuthResult = {
  session: Session | null;
  user: User | null;
  /** ข้อความภาษาไทยพร้อมแสดงให้ผู้ใช้ null = สำเร็จ */
  error: string | null;
  /**
   * ชนิดของปัญหา ใช้เลือกหน้าตากล่องแจ้ง
   * network แสดงเป็นลายทาง (ยังไม่รู้ผล) เพื่อบอกว่าไม่ใช่ความผิดของรหัสผ่าน
   */
  errorKind?: "network" | "other";
};

/** แยกปัญหาเครือข่ายออกจากปัญหาอื่น เพราะผู้ใช้ต้องแก้ต่างกัน */
function errorKindOf(error: AuthError): "network" | "other" {
  const message = error.message.toLowerCase();
  return message.includes("network") || message.includes("fetch") ? "network" : "other";
}

/**
 * แปลข้อความ error ของ Supabase เป็นภาษาไทย
 *
 * Supabase ส่งข้อความอังกฤษมาเสมอ ถ้าโชว์ตรง ๆ ผู้ใช้ทั่วไปจะไม่เข้าใจ
 */
function translateError(error: AuthError): string {
  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "อีเมล ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง · ลองพิมพ์ใหม่อีกครั้ง";
  }

  if (message.includes("user already registered")) {
    return "อีเมลหรือชื่อผู้ใช้นี้ถูกใช้แล้ว · เข้าสู่ระบบแทน หรือเลือกชื่อใหม่";
  }

  if (message.includes("password should be at least")) {
    return `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`;
  }

  if (message.includes("unable to validate email address")) {
    return "รูปแบบอีเมลไม่ถูกต้อง";
  }

  if (message.includes("email rate limit") || message.includes("over_email_send_rate_limit")) {
    return "ระบบส่งอีเมลถึงขีดจำกัดชั่วคราว กรุณารอสักครู่แล้วลองใหม่";
  }

  if (message.includes("email not confirmed")) {
    return "ยังไม่ได้ยืนยันอีเมล กรุณาตรวจสอบกล่องจดหมาย";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "ติดต่อเซิร์ฟเวอร์ไม่ได้ · ตรวจอินเทอร์เน็ตแล้วลองใหม่ ไม่ใช่ปัญหาจากรหัสผ่าน";
  }

  return `เกิดข้อผิดพลาด: ${error.message}`;
}

/** สมัครสมาชิกใหม่ด้วยอีเมลหรือชื่อผู้ใช้ และรหัสผ่าน */
export async function signUp(
  identifier: string,
  password: string
): Promise<AuthResult> {
  const username = isEmailIdentifier(identifier) ? null : identifier.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: toAuthEmail(identifier),
    password,
    // เก็บชื่อผู้ใช้ไว้ใน user metadata ด้วย เผื่อใช้แสดงผลหรือย้ายระบบภายหลัง
    options: username ? { data: { username } } : undefined,
  });

  if (error) {
    return { session: null, user: null, error: translateError(error), errorKind: errorKindOf(error) };
  }

  // ถ้าโปรเจกต์เปิด "Confirm email" ไว้ จะได้ user แต่ session เป็น null
  // ผู้ใช้ต้องไปกดลิงก์ในอีเมลก่อนจึงจะเข้าใช้งานได้
  if (data.user && !data.session) {
    return {
      session: null,
      user: data.user,
      error: "สมัครสำเร็จแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
    };
  }

  return { session: data.session, user: data.user, error: null };
}

/** เข้าสู่ระบบด้วยอีเมลหรือชื่อผู้ใช้ และรหัสผ่าน */
export async function signIn(
  identifier: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toAuthEmail(identifier),
    password,
  });

  if (error) {
    return { session: null, user: null, error: translateError(error), errorKind: errorKindOf(error) };
  }

  return { session: data.session, user: data.user, error: null };
}

/** ออกจากระบบ */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return error ? translateError(error) : null;
}

/** session ปัจจุบัน (อ่านจาก AsyncStorage ก่อน จึงเรียกได้ทันทีตอนเปิดแอป) */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * ติดตามสถานะการล็อกอิน
 *
 * @returns ฟังก์ชันสำหรับยกเลิกการติดตาม ต้องเรียกตอน component unmount
 */
export function onAuthChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => data.subscription.unsubscribe();
}

/** id ของผู้ใช้ที่ล็อกอินอยู่ ใช้เติมคอลัมน์ user_id ตอนบันทึกข้อมูล */
export async function getCurrentUserId() {
  const session = await getSession();
  return session?.user.id ?? null;
}

export type CredentialErrors = { identifier?: string; password?: string; confirm?: string };

/**
 * ตรวจข้อมูลในฟอร์มก่อนส่งไป Supabase เพื่อลด request ที่รู้อยู่แล้วว่าจะ error
 *
 * @param confirm รหัสผ่านที่พิมพ์ซ้ำ ส่งมาเฉพาะตอนสมัคร (ตอนเข้าสู่ระบบไม่ต้องพิมพ์ซ้ำ)
 */
export function validateCredentials(identifier: string, password: string, confirm?: string) {
  const errors: CredentialErrors = {};
  const value = identifier.trim();

  if (!value) {
    errors.identifier = "กรุณากรอกอีเมลหรือชื่อผู้ใช้";
  } else if (isEmailIdentifier(value)) {
    if (!EMAIL_PATTERN.test(value)) {
      // บอกวิธีแก้ด้วยตัวอย่าง ไม่ใช่แค่ว่าผิด (Build Kit)
      errors.identifier = "อีเมลยังไม่ครบ เช่น somchai@gmail.com";
    }
  } else if (!USERNAME_PATTERN.test(value.toLowerCase())) {
    errors.identifier =
      value.length < 3 || value.length > 20
        ? `ชื่อผู้ใช้ต้องยาว 3–20 ตัว ตอนนี้มี ${value.length}`
        : "ชื่อผู้ใช้ใช้ได้แค่ a-z 0-9 _ . และขึ้นต้นด้วยตัวอักษร เช่น somchai_99";
  }

  if (!password) {
    errors.password = "กรุณากรอกรหัสผ่าน";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัว ตอนนี้มี ${password.length}`;
  }

  if (confirm !== undefined) {
    if (!confirm) {
      errors.confirm = "พิมพ์รหัสผ่านอีกครั้งเพื่อยืนยัน";
    } else if (confirm !== password) {
      errors.confirm = "รหัสผ่านไม่ตรงกัน · พิมพ์ให้เหมือนช่องด้านบน";
    }
  }

  return errors;
}
