import { StyleSheet, View } from "react-native";
import { SeverityLevel } from "../../types";
import { severityMeta } from "../../constants/theme";

/**
 * แถบบอกระดับ ▮▮▮ อันตราย · ▮▮ ควรระวัง · ▮ เล็กน้อย
 *
 * วาดเป็นแท่งเอง ไม่ใช้ตัวอักษร ▮ เพราะฟอนต์ไทยไม่มีตัวนี้
 * และฟอนต์สำรองของแต่ละเครื่องวาดไม่เท่ากัน
 * จำนวนแท่งบอกระดับได้โดยไม่ต้องดูสี
 */
export default function SeverityBars({
  level,
  color,
}: {
  level: SeverityLevel;
  color: string;
}) {
  const count = severityMeta[level].rank;

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.bar, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  bar: {
    width: 4,
    height: 11,
    borderRadius: 1,
  },
});
