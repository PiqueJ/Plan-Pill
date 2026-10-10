import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { colors, radius, shadow, size } from "../../constants/theme";
import AppText from "./AppText";

/** ปุ่มลอยมุมขวาล่าง มีคำกำกับเสมอ ไม่ใช่แค่เครื่องหมาย + (Build Kit) */
export default function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="plus" size={24} color={colors.onPrimary} />
      <AppText variant="itemTitle" color={colors.onPrimary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 18,
    height: size.buttonLg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadow.fab,
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
  },
});
