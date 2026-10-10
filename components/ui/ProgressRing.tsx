import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

type Segment = { value: number; color: string };

/**
 * วงแหวนความคืบหน้าแบบหลายช่วง เช่น บันทึกแล้ว (ขาว) + ถึงเวลา (ส้ม) จากทั้งหมดของวัน
 *
 * เป็นภาพประกอบเท่านั้น ตัวเลขจริงต้องอยู่ตรงกลางวงหรือข้าง ๆ เสมอ
 */
export default function ProgressRing({
  size = 76,
  stroke = 8,
  segments,
  total,
  trackColor,
  children,
}: {
  size?: number;
  stroke?: number;
  segments: Segment[];
  total: number;
  trackColor: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const safeTotal = total > 0 ? total : 1;
  const lengths = segments.map((segment) => Math.min(1, segment.value / safeTotal) * circumference);
  // จุดเริ่มของแต่ละช่วง = ผลรวมความยาวของช่วงก่อนหน้า
  const starts = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, value) => sum + value, 0));
  const visibleCount = lengths.filter((length) => length > 0).length;

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {/* หมุนให้เริ่มที่ 12 นาฬิกา ใช้ transform แบบ SVG เพราะ prop rotation/origin เตือนบนเว็บ */}
        <G transform={`rotate(-90 ${center} ${center})`}>
          {segments.map((segment, index) => {
            const length = lengths[index];

            return length > 0 ? (
              <Circle
                key={index}
                cx={center}
                cy={center}
                r={radius}
                stroke={segment.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={-starts[index]}
                strokeLinecap={visibleCount === 1 && length < circumference ? "round" : "butt"}
              />
            ) : null;
          })}
        </G>
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
