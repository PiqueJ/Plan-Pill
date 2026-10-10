import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback } from "react";

/**
 * ไอคอนแถบสถานะสีขาวเฉพาะตอนหน้านี้อยู่บนสุด
 *
 * หน้าที่มีหัวไล่เฉดฟ้าหรือส้มต้องใช้ไอคอนขาว หน้าอื่นใช้สีเข้ม
 * ใช้ตอนโฟกัส ไม่ใช่ตอน mount เพราะแท็บที่ไม่ได้เปิดยังค้างอยู่ในหน่วยความจำ
 */
export function useLightStatusBar() {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, [])
  );
}
