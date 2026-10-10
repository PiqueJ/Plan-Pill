import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius } from "../../constants/theme";
import AppText from "./AppText";
import Button, { ButtonVariant } from "./Button";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** ขอบเส้นประ ใช้กับสถานะว่างและรายการที่พักไว้ */
  dashed?: boolean;
  /** ขอบสีบอกสถานะ เช่น ยาใกล้หมด (warn) ยาหมด (danger) */
  tone?: "warn" | "danger";
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
};

/** การ์ดขาวมุม 20 สำหรับข้อมูลทั่วไป ไม่มีเงา (ของที่ลอยจริงเท่านั้นที่มีเงา) */
export default function Card({
  children,
  style,
  dashed = false,
  tone,
  onPress,
  accessibilityLabel,
  padded = true,
}: CardProps) {
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    padded && styles.padded,
    dashed && styles.dashed,
    tone === "warn" && styles.warn,
    tone === "danger" && styles.danger,
    style,
  ];

  if (!onPress) {
    return <View style={cardStyle}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

type EmptyCardProps = {
  title: string;
  body?: string;
  actionLabel?: string;
  actionVariant?: ButtonVariant;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** สถานะว่าง: บอกสิ่งที่ทำได้ต่อเสมอ (Build Kit หัวข้อ 02) */
export function EmptyCard({
  title,
  body,
  actionLabel,
  actionVariant = "tint",
  onAction,
  style,
}: EmptyCardProps) {
  return (
    <Card dashed style={[styles.empty, style]}>
      <AppText variant="itemTitle" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" color={colors.textMuted} align="center">
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant={actionVariant} size="sm" style={styles.emptyAction} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
  },
  padded: {
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  dashed: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.dashed,
  },
  warn: {
    borderWidth: 1.5,
    borderColor: colors.warnBorder,
  },
  danger: {
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.85,
  },
  empty: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 20,
  },
  emptyAction: {
    marginTop: 10,
    alignSelf: "center",
  },
});
