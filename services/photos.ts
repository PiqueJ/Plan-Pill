/**
 * PlanPill - รูปอาหารในไดอารี่
 *
 * เก็บไฟล์ไว้ใน Supabase Storage bucket ชื่อ meal-photos ซึ่งเป็นแบบ private
 * ชื่อไฟล์บังคับรูปแบบ `<user_id>/<meal_id>.<นามสกุล>` เพราะ policy ฝั่งเซิร์ฟเวอร์
 * เทียบโฟลเดอร์ชั้นแรกกับ auth.uid() (ดู migrate-04-storage.sql)
 * ผู้ใช้จึงเข้าถึงได้เฉพาะรูปของตัวเอง แม้จะเดา path ของคนอื่นถูกก็เปิดไม่ได้
 *
 * ทำไมต้องใช้ signed URL
 *   bucket เป็น private จึงไม่มี URL ถาวรให้เอาไปแปะ
 *   ต้องขอ URL ที่มีลายเซ็นและหมดอายุในเวลาสั้น ๆ ทุกครั้งที่จะแสดงรูป
 *   ข้อดีคือถ้า URL หลุดออกไป ก็ใช้ได้แค่ชั่วคราว ไม่ใช่ตลอดไป
 */

import * as ImagePicker from "expo-image-picker";
import { getCurrentUserId } from "./auth";
import { supabase } from "./supabase";

const BUCKET = "meal-photos";

/** อายุของ signed URL หนึ่งชั่วโมง พอสำหรับการเปิดดูหนึ่งรอบ */
const SIGNED_URL_TTL_SECONDS = 3600;

/** จำกัดขนาดให้ตรงกับ file_size_limit ของ bucket */
const MAX_BYTES = 5 * 1024 * 1024;

/** รูปที่ผู้ใช้เพิ่งเลือก ยังไม่ได้อัปโหลด */
export type PickedPhoto = {
  /** path ในเครื่อง ใช้แสดงตัวอย่างได้ทันทีโดยไม่ต้องรออัปโหลด */
  uri: string;
  base64: string;
  mimeType: string;
};

export type PhotoSource = "camera" | "library";

function extensionFor(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/**
 * เปิดกล้องหรือคลังรูปให้ผู้ใช้เลือกรูป
 *
 * @returns รูปที่เลือก หรือ null เมื่อผู้ใช้กดยกเลิก
 * @throws  เมื่อไม่ได้รับสิทธิ์ หรือรูปใหญ่เกินกำหนด (ให้หน้าจอเอาไปแสดงเป็นข้อความไทย)
 */
export async function pickMealPhoto(
  source: PhotoSource
): Promise<PickedPhoto | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      source === "camera"
        ? "ยังไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์ในตั้งค่าของเครื่อง"
        : "ยังไม่ได้รับอนุญาตให้เข้าถึงคลังรูป กรุณาเปิดสิทธิ์ในตั้งค่าของเครื่อง"
    );
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [4, 3],
    // ลดคุณภาพลงตั้งแต่ต้นทาง เพราะรูปในไดอารี่แสดงขนาดเล็ก
    // ไม่จำเป็นต้องเก็บไฟล์ใหญ่ และช่วยให้อัปโหลดผ่านเน็ตมือถือได้เร็ว
    quality: 0.5,
    // ขอ base64 มาเลย จะได้ไม่ต้องอ่านไฟล์ซ้ำอีกรอบตอนอัปโหลด
    base64: true,
  };

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset?.base64) {
    throw new Error("อ่านไฟล์รูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  // base64 ยาว 4 ตัวอักษรต่อข้อมูล 3 ไบต์ จึงประมาณขนาดจริงได้จากความยาว
  if (asset.base64.length * 0.75 > MAX_BYTES) {
    throw new Error("รูปมีขนาดใหญ่เกิน 5 MB กรุณาเลือกรูปที่เล็กลง");
  }

  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** ตารางค้นย้อนกลับ สร้างครั้งเดียวตอนโหลดไฟล์ เพื่อให้ถอดรหัสรูปได้เร็ว */
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);

  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }

  return table;
})();

/**
 * แปลง base64 เป็นไบต์
 *
 * ต้องแปลงเองเพราะ supabase-js รับ Blob/ArrayBuffer ไม่รับสตริง base64
 * และการใช้ fetch(uri).blob() บน React Native ยังทำงานไม่น่าเชื่อถือ
 *
 * ไม่ใช้ atob เพราะ atob ไม่ได้มาจาก React Native แต่มาจากเอนจิน (Hermes)
 * ซึ่งแปลว่าจะพังเฉพาะบนเครื่องจริงโดยที่เว็บยังทำงานได้ปกติ หาสาเหตุยาก
 * เขียนเองไปเลยจะได้ทำงานเหมือนกันทุกที่
 */
function base64ToBytes(base64: string) {
  // ตัด padding ออกก่อน จะได้คำนวณขนาดผลลัพธ์ได้ตรง
  const clean = base64.replace(/=+$/, "");
  const byteLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  // สะสมทีละ 6 บิต พอครบ 8 บิตก็ตัดออกมาเป็นหนึ่งไบต์
  let buffer = 0;
  let bitsInBuffer = 0;

  for (let index = 0; index < clean.length; index += 1) {
    buffer = (buffer << 6) | BASE64_LOOKUP[clean.charCodeAt(index)];
    bitsInBuffer += 6;

    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[byteIndex] = (buffer >> bitsInBuffer) & 0xff;
      byteIndex += 1;
    }
  }

  return bytes;
}

/**
 * อัปโหลดรูปของมื้อหนึ่งขึ้น Supabase Storage
 *
 * @returns path ที่เก็บไว้ สำหรับบันทึกลงคอลัมน์ meals.photo_path
 * @throws  เมื่ออัปโหลดไม่สำเร็จ เช่น ออฟไลน์ ให้หน้าจอตัดสินใจว่าจะบันทึกมื้อต่อหรือไม่
 */
export async function uploadMealPhoto(mealId: string, photo: PickedPhoto) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  }

  const path = `${userId}/${mealId}.${extensionFor(photo.mimeType)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToBytes(photo.base64), {
      contentType: photo.mimeType,
      // อัปโหลดทับได้ เพื่อให้เปลี่ยนรูปของมื้อเดิมไม่เกิดไฟล์ค้าง
      upsert: true,
    });

  if (error) {
    throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${error.message}`);
  }

  return path;
}

/**
 * ขอ URL ชั่วคราวสำหรับแสดงรูปหลายรูปพร้อมกัน
 *
 * ใช้ในหน้าไดอารี่ที่มีหลายมื้อ ขอทีเดียวจบแทนที่จะยิงทีละรูป
 *
 * @returns map จาก path ไปเป็น URL เฉพาะรูปที่ขอสำเร็จ
 */
export async function getMealPhotoUrls(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];

  if (unique.length === 0) {
    return {};
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    // ออฟไลน์หรือขอไม่สำเร็จ — หน้าจอจะแสดงกรอบแทนรูป ไม่ถือเป็นข้อผิดพลาดร้ายแรง
    console.log("ขอ URL รูปอาหารไม่สำเร็จ:", error?.message);
    return {};
  }

  const urls: Record<string, string> = {};

  data.forEach((item) => {
    if (item.signedUrl && item.path) {
      urls[item.path] = item.signedUrl;
    }
  });

  return urls;
}

/** ขอ URL ชั่วคราวของรูปเดียว ใช้ตอนเปิดฟอร์มแก้ไขมื้อเดิม */
export async function getMealPhotoUrl(path: string) {
  const urls = await getMealPhotoUrls([path]);
  return urls[path] ?? null;
}

/**
 * ลบรูปออกจาก Storage
 *
 * เรียกตอนลบมื้อ หรือตอนผู้ใช้เอารูปออก เพื่อไม่ให้เหลือไฟล์กำพร้าค้างไว้
 * ล้มเหลวได้โดยไม่ทำให้งานหลักพัง เพราะไฟล์ค้างไม่กระทบผู้ใช้เท่ากับลบมื้อไม่ได้
 */
export async function deleteMealPhoto(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.log("ลบรูปอาหารไม่สำเร็จ:", error.message);
  }
}
