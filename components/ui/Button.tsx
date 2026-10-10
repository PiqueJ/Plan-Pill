import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { TypeVariant, colors, radius, size } from "../../constants/theme";
import AppText from "./AppText";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ButtonVariant =
  | "primary"
  | "onHero"
  | "onHeroSecondary"
  | "secondary"
  | "tertiary"
  | "plain"
  | "tint"
  | "danger";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** lg = ปุ่มหลักสูง 56 · md = 50 · sm = 44 (พื้นที่กดขั้นต่ำ) */
  size?: "lg" | "md" | "sm";
  icon?: IconName;
  loading?: boolean;
  /** ข้อความตอนกำลังทำงาน เช่น "กำลังบันทึก…" */
  loadingLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

type Look = { background: string; pressed: string; text: string; border?: string };

const LOOKS: Record<ButtonVariant, Look> = {
  primary: { background: colors.primary, pressed: colors.primaryPressed, text: colors.onPrimary },
  onHero: { background: colors.surface, pressed: "#E6EEF9", text: colors.onHeroText },
  onHeroSecondary: {
    background: "rgba(255,255,255,0.16)",
    pressed: "rgba(255,255,255,0.28)",
    text: colors.onPrimary,
    border: colors.onPrimaryLine,
  },
  secondary: { background: colors.surface, pressed: colors.primaryTint, text: colors.primaryText, border: colors.primary },
  tertiary: { background: colors.tertiary, pressed: "#E1E9F2", text: colors.tertiaryText },
  plain: { background: colors.surface, pressed: colors.tertiary, text: colors.text },
  tint: { background: colors.primaryTint, pressed: "#C9DDF7", text: colors.onHeroText },
  danger: { background: colors.danger, pressed: "#AE2E31", text: colors.onPrimary },
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, { height: number; radius: number; text: TypeVariant; icon: number }> = {
  lg: { height: size.buttonLg, radius: radius.button, text: "button", icon: 22 },
  md: { height: size.button, radius: radius.field, text: "bodyStrong", icon: 20 },
  sm: { height: size.touch, radius: radius.small, text: "label", icon: 18 },
};

/**
 * ปุ่มทุกแบบตาม Build Kit
 *
 * ปุ่มที่ปิดอยู่เป็นสีเทาทั้งปุ่ม ส่วนปุ่มที่กำลังทำงานคงสีเดิมไว้แต่จางลงพร้อมวงหมุน
 * และกดซ้ำไม่ได้ ผู้ใช้จึงแยกออกว่า "ยังกดไม่ได้" กับ "กำลังทำงาน"
 */
export default function Button({
  label,
  onPress,
  variant = "primary",
  size: sizeName = "lg",
  icon,
  loading = false,
  loadingLabel,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const look = LOOKS[variant];
  const dims = SIZES[sizeName];
  const inactive = disabled || loading;
  const textColor = disabled ? colors.disabledText : look.text;
  // ปุ่มรองบนการ์ดฮีโร่ใช้ตัวเล็กกว่าปุ่มหลักตามไฟล์ออกแบบ
  const textVariant: TypeVariant = variant === "onHeroSecondary" ? "label" : dims.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: variant === "onHeroSecondary" ? 46 : dims.height,
          borderRadius: variant === "onHeroSecondary" ? radius.tile : dims.radius,
          backgroundColor: disabled ? colors.disabled : pressed ? look.pressed : look.background,
          borderColor: disabled ? colors.disabled : look.border ?? "transparent",
          borderWidth: look.border ? (variant === "secondary" ? 1.5 : 1) : 0,
          opacity: loading ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={dims.icon} color={textColor} />
        ) : null}
        <AppText variant={textVariant} weight="bold" color={textColor} numberOfLines={1}>
          {loading && loadingLabel ? loadingLabel : label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
