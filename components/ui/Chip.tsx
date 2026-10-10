import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { FoodIcon } from "../../constants/foodIcons";
import { SeverityLevel } from "../../types";
import { colors, radius, severityMeta } from "../../constants/theme";
import AppText from "./AppText";
import SeverityBars from "./SeverityBars";

type ChipProps = {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  /** อาจตีกับยาที่กินอยู่ แสดงเครื่องหมาย ! และสีส้ม */
  warn?: boolean;
  /** แสดง ✓ หน้าคำเมื่อเลือกอยู่ ใช้กับตัวเลือกที่เลือกได้หลายอัน */
  check?: boolean;
  /** สีตอนเลือก ink ใช้กับตัวกรองระดับคำเตือน เพื่อไม่ให้ฟ้าไปปนกับความหมาย "ทำแล้ว" */
  selectedTone?: "primary" | "ink";
  /** ใส่แถบระดับความรุนแรงหน้าคำ */
  severity?: SeverityLevel;
  /** สัญลักษณ์ในวงกลมหน้าคำ เช่น ไอคอนหมวดอาหาร ช่วยให้กวาดตาหาเจอเร็ว */
  leading?: FoodIcon;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * ชิปตาม Build Kit: ปกติ · เลือก · ! ตีกับยา · เลือก + ตีกับยา
 *
 * ชิปที่ตีกับยายังเลือกได้ตามปกติ สีส้มเป็นแค่ข้อมูล ไม่ใช่การห้าม
 */
export default function Chip({
  label,
  onPress,
  selected = false,
  warn = false,
  check = false,
  selectedTone = "primary",
  severity,
  leading,
  style,
  accessibilityLabel,
}: ChipProps) {
  const selectedBackground = selectedTone === "ink" ? colors.ink : colors.primary;

  let background: string = colors.surface;
  let text: string = colors.textSoft;
  let border: string = colors.border;
  let borderWidth = 1;

  if (selected) {
    background = selectedBackground;
    text = colors.onPrimary;
    border = warn ? colors.warn : selectedBackground;
    borderWidth = warn ? 2 : 1;
  } else if (severity === "major") {
    background = colors.dangerTint;
    text = colors.dangerText;
    border = colors.dangerTint;
  } else if (warn || severity === "moderate") {
    background = colors.warnTint;
    text = colors.warnText;
    border = colors.warnTint;
  }

  const prefix = `${selected && check ? "✓ " : ""}${warn ? "! " : ""}`;
  const describedAs = `${label}${selected ? " เลือกอยู่" : ""}${warn ? " อาจตีกับยาที่กินอยู่" : ""}`;

  const body = (
    <View style={styles.row}>
      {leading ? (
        <View
          style={[
            styles.leading,
            { backgroundColor: selected ? "rgba(255,255,255,0.22)" : warn ? colors.surface : leading.background },
          ]}
        >
          <MaterialCommunityIcons name={leading.icon} size={19} color={selected ? colors.onPrimary : leading.color} />
        </View>
      ) : null}
      {selected && check && !leading ? (
        <MaterialCommunityIcons name="check-bold" size={14} color={text} />
      ) : null}
      {severity ? (
        <SeverityBars level={severity} color={selected ? colors.onPrimary : severityMeta[severity].rank === 3 ? colors.danger : text} />
      ) : null}
      <AppText variant="label" weight={selected || warn ? "bold" : "medium"} color={text}>
        {`${warn ? "! " : ""}${label}`}
      </AppText>
      {/* มีไอคอนนำหน้าแล้ว ย้ายเครื่องหมายเลือกไปไว้ท้ายคำ ไอคอนหมวดจะได้อยู่ที่เดิมเสมอ */}
      {selected && check && leading ? (
        <MaterialCommunityIcons name="check-bold" size={15} color={text} />
      ) : null}
    </View>
  );

  const chipStyle = [
    styles.chip,
    {
      backgroundColor: background,
      borderColor: border,
      borderWidth,
      paddingVertical: leading ? (borderWidth === 2 ? 4 : 5) : borderWidth === 2 ? 8 : 9,
      paddingLeft: leading ? (borderWidth === 2 ? 4 : 5) : 14,
    },
    style,
  ];

  if (!onPress) {
    return <View style={chipStyle}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? (prefix ? describedAs : label)}
      hitSlop={4}
      style={({ pressed }) => [chipStyle, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  leading: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
});
