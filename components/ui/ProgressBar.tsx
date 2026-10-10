import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { radius } from "../../constants/theme";

type Segment = { value: number; color: string };

/**
 * แถบความคืบหน้าแบบหลายช่วง เช่น บันทึกแล้ว (ฟ้า) + ถึงเวลา (ส้ม) จากทั้งหมดของวัน
 *
 * เป็นส่วนประกอบทางสายตาเท่านั้น ตัวเลขจริงต้องมีข้อความกำกับข้าง ๆ เสมอ
 */
export default function ProgressBar({
  segments,
  total,
  height = 10,
  trackColor = "#DDE6EF",
  style,
}: {
  segments: Segment[];
  total: number;
  height?: number;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const safeTotal = total > 0 ? total : 1;

  return (
    <View
      style={[styles.track, { height, backgroundColor: trackColor }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {segments.map((segment, index) =>
        segment.value > 0 ? (
          <View
            key={index}
            style={{ width: `${Math.min(100, (segment.value / safeTotal) * 100)}%`, backgroundColor: segment.color }}
          />
        ) : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
