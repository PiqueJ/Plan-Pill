import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useSegments } from "expo-router";
import { ComponentProps } from "react";
import { ColorValue, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, size } from "../../constants/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** ไอคอนตอนเลือก (ทึบ) กับตอนไม่เลือก (เส้น) แยกสถานะได้ด้วยรูปทรง ไม่ใช่สีอย่างเดียว */
const TAB_ICONS: Record<string, { active: IconName; idle: IconName }> = {
  index: { active: "calendar-today", idle: "calendar-today-outline" },
  medications: { active: "pill", idle: "pill" },
  meals: { active: "bowl-mix", idle: "bowl-mix-outline" },
  history: { active: "chart-box", idle: "chart-box-outline" },
  settings: { active: "cog", idle: "cog-outline" },
};

function tabIcon(name: string) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    const icons = TAB_ICONS[name];
    return <MaterialCommunityIcons name={focused ? icons.active : icons.idle} size={24} color={color} />;
  };
}

function tabLabel(label: string) {
  return function TabLabel({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <Text
        style={{
          fontFamily: focused ? font.bold : font.medium,
          fontSize: 11.5,
          // ต้องกำหนดเอง ไม่งั้นสระบนล่างของภาษาไทยจะโดนตัดขอบ
          lineHeight: 17,
          color,
        }}
      >
        {label}
      </Text>
    );
  };
}

/**
 * แท็บบาร์ 5 แท็บ สูง 76 + safe area (Build Kit)
 *
 * ทุกแท็บซ่อนหัวข้อด้านบน เพราะแต่ละหน้ามีชื่อหน้าตัวใหญ่อยู่ในเนื้อหาเอง
 */
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  // ซ่อนแถบแท็บในหน้าลึก (รายละเอียดยา ฟอร์มเพิ่ม/แก้ไข) ตามไฟล์ออกแบบ
  // หน้าพวกนี้มีปุ่มย้อนกลับหรือปุ่มบันทึกของตัวเองอยู่ด้านล่างแล้ว
  const isNested = segments.length > 2;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarStyle: {
          display: isNested ? "none" : "flex",
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: size.tabBar + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "วันนี้", tabBarIcon: tabIcon("index"), tabBarLabel: tabLabel("วันนี้") }}
      />
      <Tabs.Screen
        name="medications"
        options={{ title: "ยา", tabBarIcon: tabIcon("medications"), tabBarLabel: tabLabel("ยา") }}
      />
      <Tabs.Screen
        name="meals"
        options={{ title: "อาหาร", tabBarIcon: tabIcon("meals"), tabBarLabel: tabLabel("อาหาร") }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "ประวัติ", tabBarIcon: tabIcon("history"), tabBarLabel: tabLabel("ประวัติ") }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "ตั้งค่า", tabBarIcon: tabIcon("settings"), tabBarLabel: tabLabel("ตั้งค่า") }}
      />
    </Tabs>
  );
}
