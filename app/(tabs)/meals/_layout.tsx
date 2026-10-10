import { Stack } from "expo-router";
import { colors } from "../../../constants/theme";


/**
 * หน้าแรกของ tab (anchor) ต้องอยู่ใต้หน้าซ้อนเสมอ แม้เปิดหน้าซ้อนมาจาก tab อื่น
 * ไม่งั้นปิดหน้าซ้อนแล้ว tab นี้จะค้างอยู่ที่หน้าซ้อน (ดู services/navigation.ts)
 */
export const unstable_settings = {
  anchor: "index",
};

/** Stack ของ tab ไดอารี่อาหาร: รายการมื้อ → บันทึกมื้อใหม่ / แก้ไขมื้อเดิม */
export default function MealsLayout() {
  return (
    <Stack
      screenOptions={{
        // ทุกหน้าวาดหัวของตัวเอง (ชื่อตัวใหญ่ หัวไล่เฉด หรือแถบ ✕ ของฟอร์ม)
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "ไดอารี่อาหาร" }} />
      <Stack.Screen name="new" options={{ title: "บันทึกมื้ออาหาร" }} />
      <Stack.Screen name="edit/[mealId]" options={{ title: "แก้ไขมื้ออาหาร" }} />
    </Stack>
  );
}
