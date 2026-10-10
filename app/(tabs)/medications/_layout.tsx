import { Stack } from "expo-router";
import { colors } from "../../../constants/theme";


/**
 * หน้าแรกของ tab (anchor) ต้องอยู่ใต้หน้าซ้อนเสมอ แม้เปิดหน้าซ้อนมาจาก tab อื่น
 * ไม่งั้นปิดหน้าซ้อนแล้ว tab นี้จะค้างอยู่ที่หน้าซ้อน (ดู services/navigation.ts)
 */
export const unstable_settings = {
  anchor: "index",
};

/** Stack ของ tab รายการยา: รายการ → รายละเอียด → แก้ไข และหน้าเพิ่มยา */
export default function MedicationsLayout() {
  return (
    <Stack
      screenOptions={{
        // ทุกหน้าวาดหัวของตัวเอง (ชื่อตัวใหญ่ หัวไล่เฉด หรือแถบ ✕ ของฟอร์ม)
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "รายการยา" }} />
      <Stack.Screen name="new" options={{ title: "เพิ่มยา" }} />
      <Stack.Screen name="[medicationId]" options={{ title: "รายละเอียดยา" }} />
      <Stack.Screen
        name="edit/[medicationId]"
        options={{ title: "แก้ไขข้อมูลยา" }}
      />
    </Stack>
  );
}
