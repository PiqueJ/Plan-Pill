/**
 * PlanPill - design tokens ชุด "Sky"
 *
 * อ้างอิงไฟล์ออกแบบ PlanPill Sky 10 Screens และ PlanPill Sky Build Kit
 * ค่าสีทั้งหมดเอามาจาก Build Kit ซึ่งให้ hex พร้อมใช้กับ React Native
 * ค่าที่ Build Kit ไม่ได้ระบุ (เช่นพื้นกล่องควรระวัง) แปลงจาก oklch ในไฟล์ 10 Screens
 * แล้วปรับให้เข้าชุดกับค่าใน Build Kit
 *
 * ────────────────────────────────────────────────────────────────
 *  กฎเรื่องสีที่ห้ามละเมิด (จาก Build Kit)
 *
 *    ฟ้า  = ทำแล้ว / ปุ่มหลัก
 *    ส้ม  = ถึงเวลา / ควรระวัง
 *    แดง = อันตราย / การลบ เท่านั้น
 *    ห้ามใช้สีเขียวกับ "ยังไม่ได้ตรวจ" และระดับ "เล็กน้อย" เป็นสีเทา ไม่ใช่เขียว
 *
 *  การ์ดไล่เฉดฟ้า-คราม ใช้กับสิ่งที่ "ต้องทำตอนนี้" เท่านั้น
 *  ข้อมูลทั่วไปอยู่บนการ์ดขาว
 *
 *  ทุกที่ที่ใช้สีบอกความหมาย ต้องมีสัญลักษณ์หรือข้อความกำกับด้วยเสมอ
 *  (✓ ● ⊘ ✕ และแถบ ▮▮▮) คนตาบอดสีต้องอ่านรู้เรื่องโดยไม่ต้องเห็นสี
 * ────────────────────────────────────────────────────────────────
 *
 *  ไม่มีโหมดมืด (Build Kit ระบุไว้)
 */

import { DoseStatus, SeverityLevel } from "../types";

export const colors = {
  /** พื้นหลังของทุกหน้า */
  background: "#F2F7FB",
  surface: "#FFFFFF",
  /** เส้นแบ่งและขอบการ์ด */
  border: "#E1E7EE",
  /** เส้นแบ่งแถวในการ์ด อ่อนกว่า border */
  divider: "#EEF2F6",
  inputBorder: "#D5DDE6",
  placeholder: "#8A94A3",
  /** ขอบเส้นประของการ์ดว่าง */
  dashed: "#B8C2CF",

  text: "#1A2230",
  textMuted: "#5E6878",
  textSoft: "#46505E",

  primary: "#2268C8",
  primaryPressed: "#1B56A6",
  /** ปลายไล่เฉดของการ์ดฮีโร่ */
  primaryDeep: "#2E4BAE",
  /** ข้อความสีฟ้าบนพื้นขาว เช่น ปุ่มรองและเครื่องหมาย ✓ */
  primaryText: "#1E5BB0",
  /** ข้อความบนปุ่มขาวที่วางบนการ์ดฮีโร่ */
  onHeroText: "#1E4E9E",
  primaryTint: "#DCEAFB",

  /** ปุ่มระดับสาม เช่น ยกเลิก */
  tertiary: "#EEF3F8",
  tertiaryText: "#35507A",
  neutralTint: "#EEF2F6",
  disabled: "#E1E7EE",
  disabledText: "#8A94A3",

  warn: "#E07A2E",
  warnTint: "#FCE9D6",
  /** ข้อความบนพื้นส้มอ่อน */
  warnText: "#8F4712",
  /** พื้นกล่อง "ควรระวัง" ขนาดใหญ่ อ่อนกว่า warnTint */
  warnSurface: "#FDF3E8",
  warnBorder: "#F2C29B",
  /** ส้มสว่างสำหรับป้ายบนการ์ดฮีโร่ ใช้คู่กับ onWarnBright เท่านั้น */
  warnBright: "#FFB466",
  onWarnBright: "#3B1D08",

  danger: "#C8383B",
  dangerTint: "#FCEEEE",
  dangerText: "#B02E31",
  dangerDeep: "#7A2224",

  /** แถบแจ้งผลสีเข้ม เช่น "บันทึกแล้ว · เลิกทำ" */
  ink: "#1A2230",
  onInkAction: "#A9CBF5",

  onPrimary: "#FFFFFF",
  onPrimaryMuted: "rgba(255,255,255,0.88)",
  onPrimaryFaint: "rgba(255,255,255,0.18)",
  onPrimaryLine: "rgba(255,255,255,0.35)",
};

/**
 * ไล่เฉดใช้กับ expo-linear-gradient
 *
 * hero  = การ์ด "ต้องทำตอนนี้" และหัวหน้าจอ
 * warn  = หัวหน้าประวัติคำเตือน (ตรวจแล้วว่าตัวอักษรขาวผ่าน 4.5:1 ทั้งสองปลาย)
 */
export const gradients = {
  hero: ["#2268C8", "#2E4BAE"] as const,
  warn: ["#B85A12", "#9C3A10"] as const,
};

/** ทิศไล่เฉด 160° แบบเดียวกับในไฟล์ออกแบบ */
export const gradientDirection = {
  start: { x: 0.33, y: 0 },
  end: { x: 0.67, y: 1 },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** ขอบซ้ายขวาของหน้าจอ */
  screen: 20,
  /** ช่องไฟระหว่างการ์ด */
  gap: 10,
};

export const radius = {
  /** การ์ดฮีโร่ (ไล่เฉด) */
  hero: 26,
  /** มุมล่างของหัวหน้าจอไล่เฉด */
  header: 30,
  /** การ์ดรายการ */
  card: 20,
  cardSm: 16,
  /** ปุ่มหลักสูง 56 */
  button: 18,
  /** ปุ่มรองและช่องกรอก */
  field: 16,
  tile: 14,
  small: 12,
  /** แผ่นเลื่อนขึ้น (มุมบน) */
  sheet: 28,
  pill: 999,
};

export const size = {
  buttonLg: 56,
  button: 50,
  /** พื้นที่กดขั้นต่ำ */
  touch: 44,
  /** ความสูงแท็บบาร์ ไม่รวม safe area */
  tabBar: 76,
  statusDot: 34,
};

/**
 * ฟอนต์ Anuphan (ตามไฟล์ออกแบบ)
 *
 * React Native ไม่มีฟอนต์ตั้งต้นทั้งแอป จึงใช้คอมโพเนนต์ AppText ซึ่งใส่ fontFamily ให้เอง
 * ถ้าต้องใช้ Text หรือ TextInput ตรง ๆ ต้องใส่ fontFamily จากที่นี่ทุกครั้ง
 */
export const font = {
  regular: "Anuphan_400Regular",
  medium: "Anuphan_500Medium",
  semibold: "Anuphan_600SemiBold",
  bold: "Anuphan_700Bold",
};

export type FontWeightName = keyof typeof font;

type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  weight: FontWeightName;
  letterSpacing?: number;
};

/**
 * ขนาดตัวอักษรตาม Build Kit
 *
 * lineHeight ตั้งอย่างน้อย 1.4 เท่า เพราะภาษาไทยมีวรรณยุกต์ซ้อนสองชั้น
 * และ Anuphan มีส่วนบนสุดสูงกว่าขนาดตัวอักษรเล็กน้อย ถ้าเตี้ยกว่านี้ Android จะตัดหัววรรณยุกต์
 * letterSpacing ติดลบตามไฟล์ออกแบบ (-0.025em, -0.02em, -0.015em)
 *
 * ผู้ใช้ขยายทุกขนาดได้จากหน้าตั้งค่า ×1.15 หรือ ×1.3
 */
export const typeScale = {
  timeHero: { fontSize: 32, lineHeight: 44, weight: "bold", letterSpacing: -0.8 },
  drugHero: { fontSize: 29, lineHeight: 40, weight: "bold", letterSpacing: -0.58 },
  title: { fontSize: 26, lineHeight: 36, weight: "bold", letterSpacing: -0.39 },
  heading: { fontSize: 21, lineHeight: 30, weight: "bold" },
  button: { fontSize: 19, lineHeight: 27, weight: "bold" },
  itemTitle: { fontSize: 17, lineHeight: 24, weight: "bold" },
  bodyStrong: { fontSize: 15.5, lineHeight: 23, weight: "semibold" },
  body: { fontSize: 15, lineHeight: 22.5, weight: "regular" },
  label: { fontSize: 13.5, lineHeight: 20, weight: "semibold" },
  small: { fontSize: 13, lineHeight: 19.5, weight: "regular" },
  meta: { fontSize: 12.5, lineHeight: 18.5, weight: "medium" },
  tiny: { fontSize: 11.5, lineHeight: 17, weight: "medium" },
} satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typeScale;

/**
 * เงาอ่อน ใช้เฉพาะของที่ลอยจริง (การ์ดฮีโร่ ปุ่มลอย แถบล่าง) การ์ดขาวทั่วไปไม่มีเงา
 *
 * ใช้ boxShadow แทน shadow* ชุดเก่า ซึ่ง React Native เลิกแนะนำแล้ว
 * boxShadow ใช้ได้ทั้ง iOS Android และเว็บในสถาปัตยกรรมใหม่ (Expo Go SDK 57)
 */
export const shadow = {
  hero: { boxShadow: "0 12px 24px -10px rgba(46,75,174,0.55)" },
  fab: { boxShadow: "0 10px 20px -8px rgba(46,75,174,0.6)" },
  bar: { boxShadow: "0 -8px 20px -14px rgba(43,62,92,0.45)" },
  segment: { boxShadow: "0 2px 6px -2px rgba(43,62,92,0.3)" },
};

/**
 * หน้าตาของสถานะมื้อยา 5 แบบ (Build Kit หัวข้อ "ป้ายสถานะมื้อยา")
 *
 * label ใช้ในหน้าประวัติและไฟล์ที่ส่งออก ต้องอ่านรู้เรื่องโดยไม่ต้องเห็นสี
 */
export const doseStatusMeta: Record<
  DoseStatus,
  { label: string; symbol: string; background: string; color: string; border?: string; dashed?: boolean }
> = {
  upcoming: { label: "ยังไม่ถึงเวลา", symbol: "", background: "#E8EEF5", color: colors.textSoft, border: colors.inputBorder },
  reminded: { label: "รอบันทึก", symbol: "●", background: colors.warn, color: colors.onPrimary },
  taken: { label: "บันทึกแล้ว", symbol: "✓", background: colors.primaryTint, color: colors.primaryText },
  skipped: { label: "ข้ามมื้อนี้", symbol: "⊘", background: "transparent", color: colors.textMuted, border: "#97A2B2", dashed: true },
  missed: { label: "ไม่ได้บันทึก", symbol: "✕", background: colors.dangerTint, color: colors.dangerText, border: colors.danger },
};

/** ระดับคำเตือน ▮▮▮ อันตราย · ▮▮ ควรระวัง · ▮ เล็กน้อย */
export const severityMeta: Record<
  SeverityLevel,
  { label: string; bars: string; background: string; color: string; border: string; rank: number }
> = {
  major: { label: "อันตราย", bars: "▮▮▮", background: colors.danger, color: colors.onPrimary, border: colors.danger, rank: 3 },
  moderate: { label: "ควรระวัง", bars: "▮▮", background: colors.warnTint, color: colors.warnText, border: colors.warnBorder, rank: 2 },
  minor: { label: "เล็กน้อย", bars: "▮", background: colors.neutralTint, color: colors.textSoft, border: colors.border, rank: 1 },
};

/**
 * สีประจำช่วงเวลาของวัน ใช้ตกแต่งเท่านั้น (ไอคอนหัวกลุ่มมื้อยา ป้ายมื้ออาหาร)
 *
 * เลือกเฉพาะโทนเย็น (ฟ้า คราม ม่วง เขียวน้ำทะเล เทาเข้ม) ไม่ใช้ส้มหรือแดง
 * เพราะสองสีนั้นมีความหมายว่า "ถึงเวลา/ควรระวัง" และ "อันตราย" แล้ว
 * ทุกที่ที่ใช้ต้องมีชื่อช่วงเวลาเป็นตัวหนังสือกำกับเสมอ
 */
export const periodPalette = {
  morning: { label: "เช้า", icon: "weather-sunset-up", background: "#E0F2FE", color: "#0369A1" },
  noon: { label: "กลางวัน", icon: "white-balance-sunny", background: "#E0E7FF", color: "#3730A3" },
  evening: { label: "เย็น", icon: "weather-sunset-down", background: "#F3E8FF", color: "#7E22CE" },
  night: { label: "ก่อนนอน", icon: "weather-night", background: "#E2E8F0", color: "#334155" },
  snack: { label: "ของว่าง", icon: "cookie-outline", background: "#CCFBF1", color: "#0F766E" },
} as const;

export type Period = keyof typeof periodPalette;

/** ข้อความ responsible use ที่ต้องแสดงในแอปตามข้อกำหนดของรายวิชา */
export const DISCLAIMER =
  "เครื่องมือช่วยจำเพื่อการศึกษา ไม่ใช้แทนคำแนะนำของแพทย์หรือเภสัชกร";
