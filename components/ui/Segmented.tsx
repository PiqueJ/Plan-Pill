import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius, shadow } from "../../constants/theme";
import AppText from "./AppText";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** สีข้อความตอนเลือก ใช้กับแท็บคำเตือนที่เป็นสีส้ม */
  selectedColor?: string;
};

type SegmentedProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** ตัวเลือกแบบแถบ (เข้าสู่ระบบ/สมัครใหม่ · มื้อ · การกินยา/คำเตือน) */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel,
}: SegmentedProps<T>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText
              variant="label"
              weight={selected ? "bold" : "medium"}
              color={selected ? option.selectedColor ?? colors.text : colors.textMuted}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: "#E3EAF2",
    borderRadius: radius.field,
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 6,
  },
  selected: {
    backgroundColor: colors.surface,
    ...shadow.segment,
  },
});
