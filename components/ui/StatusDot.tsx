import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { DoseStatus } from "../../types";
import { colors, doseStatusMeta } from "../../constants/theme";
import AppText from "./AppText";

/**
 * วงสถานะมื้อยา 5 แบบ (Build Kit)
 *
 *   ยังไม่ถึงเวลา   วงเทา + เลขชั่วโมง
 *   เตือนแล้ว       ส้มทึบ + วงแสง
 *   บันทึกแล้ว      ฟ้าอ่อน + ✓
 *   ข้ามมื้อนี้       เส้นประ + ⊘
 *   ไม่ได้บันทึก     แดงอ่อน + ขอบแดง + ✕
 *
 * ทุกแบบมีสัญลักษณ์ต่างกัน แยกออกได้โดยไม่ต้องเห็นสี
 */
export default function StatusDot({
  status,
  hour,
  size = 34,
}: {
  status: DoseStatus;
  /** เลขชั่วโมงที่แสดงในวงของมื้อที่ยังไม่ถึงเวลา */
  hour?: string;
  size?: number;
}) {
  const meta = doseStatusMeta[status];
  const iconSize = Math.round(size * 0.47);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          backgroundColor: meta.background,
          borderColor: meta.border ?? "transparent",
          borderWidth: meta.border ? (meta.dashed ? 2 : 1.5) : 0,
          borderStyle: meta.dashed ? "dashed" : "solid",
        },
        status === "reminded" && styles.glow,
      ]}
    >
      {status === "upcoming" ? (
        <AppText variant="tiny" weight="bold" color={meta.color}>
          {hour ?? ""}
        </AppText>
      ) : status === "reminded" ? (
        <View style={styles.reminderCore} />
      ) : (
        <MaterialCommunityIcons
          name={status === "taken" ? "check-bold" : status === "skipped" ? "cancel" : "close-thick"}
          size={iconSize}
          color={meta.color}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    // ห้ามใช้ flex: 0 บนเว็บจะกลายเป็น flex-basis 0% แล้ววงหดจนมองไม่เห็น
    flexShrink: 0,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    boxShadow: "0 0 0 5px rgba(224,122,46,0.2)",
  },
  reminderCore: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.onPrimary,
  },
});
