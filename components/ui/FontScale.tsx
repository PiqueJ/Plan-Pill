import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * ขนาดตัวอักษรที่ผู้ใช้เลือกเองในหน้าตั้งค่า (Build Kit: ×1.15 / ×1.3)
 *
 * เก็บเป็นค่าของเครื่อง ไม่ผูกกับบัญชี เพราะเป็นเรื่องสายตาของคนที่ถือเครื่อง
 * แยกจากขนาดตัวอักษรของระบบปฏิบัติการ ซึ่ง React Native คูณให้อยู่แล้ว
 */
export const FONT_SCALES = [
  { value: 1, label: "ปกติ" },
  { value: 1.15, label: "ใหญ่" },
  { value: 1.3, label: "ใหญ่มาก" },
] as const;

const STORAGE_KEY = "planpill_font_scale";

export async function loadFontScale(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : 1;
    return FONT_SCALES.some((item) => item.value === value) ? value : 1;
  } catch {
    return 1;
  }
}

type FontScaleContextValue = {
  scale: number;
  setScale: (value: number) => void;
};

const FontScaleContext = createContext<FontScaleContextValue>({
  scale: 1,
  setScale: () => {},
});

export function FontScaleProvider({
  initialScale,
  children,
}: {
  initialScale: number;
  children: ReactNode;
}) {
  const [scale, setScaleState] = useState(initialScale);

  const setScale = useCallback((value: number) => {
    setScaleState(value);
    AsyncStorage.setItem(STORAGE_KEY, String(value)).catch((error) =>
      console.log("Error saving font scale:", error)
    );
  }, []);

  const value = useMemo(() => ({ scale, setScale }), [scale, setScale]);

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>;
}

export function useFontScale() {
  return useContext(FontScaleContext);
}
