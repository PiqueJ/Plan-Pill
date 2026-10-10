import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { FoodIcon } from "../../constants/foodIcons";
import { colors, radius } from "../../constants/theme";
import AppText from "./AppText";

const TONES = {
  neutral: { background: colors.neutralTint, color: colors.textSoft },
  primary: { background: colors.primaryTint, color: colors.primaryText },
  warn: { background: colors.warnTint, color: colors.warnText },
  danger: { background: colors.dangerTint, color: colors.dangerText },
};

/** ป้ายเล็กที่กดไม่ได้ เช่น ชนิดมื้อ หรือหมวดอาหารบนการ์ดไดอารี่ */
export default function Tag({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: keyof typeof TONES;
  /** ไอคอนหมวดอาหารหน้าคำ (ใช้สีของหมวด ยกเว้นป้ายเตือนที่ใช้สีส้มทั้งป้าย) */
  icon?: FoodIcon;
}) {
  const look = TONES[tone];

  return (
    <View style={[styles.tag, { backgroundColor: look.background }]}>
      {icon ? (
        <MaterialCommunityIcons name={icon.icon} size={14} color={tone === "neutral" ? icon.color : look.color} />
      ) : null}
      <AppText variant="tiny" weight={tone === "neutral" ? "medium" : "bold"} color={look.color}>
        {tone === "warn" ? `! ${label}` : label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
});
