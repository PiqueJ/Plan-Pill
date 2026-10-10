import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ComponentProps, ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, gradientDirection, gradients, radius, spacing } from "../../constants/theme";
import AppText from "./AppText";

/**
 * หัวหน้าจอแบบตัวใหญ่ของแท็บหลัก ("วันนี้" "ยาของฉัน" "ไดอารี่อาหาร" "ตั้งค่า")
 * ไม่มีแถบนำทางด้านบน ชื่อหน้าอยู่ในเนื้อหาเลย
 */
export function ScreenTitle({
  title,
  eyebrow,
  subtitle,
  right,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        {eyebrow ? (
          <AppText variant="small" color={colors.textMuted}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/**
 * แถบบนของฟอร์ม: ปุ่ม ✕ ปิด ชื่อหน้าอยู่กลาง
 *
 * ใช้ ✕ แทนลูกศรย้อนกลับ เพราะฟอร์มเป็นงานที่ "ยกเลิกได้" ไม่ใช่การเดินลึกเข้าไป
 */
export function FormTopBar({
  title,
  onClose,
  closeLabel = "ปิดโดยไม่บันทึก",
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        hitSlop={6}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="close" size={24} color={colors.tertiaryText} />
      </Pressable>
      <AppText variant="itemTitle" style={styles.topBarTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.iconButton} />
    </View>
  );
}

/**
 * หัวหน้าจอไล่เฉด มุมล่างมน ใช้กับหน้ารายละเอียดยา หน้าประวัติ และหน้าเข้าสู่ระบบ
 *
 * ตัวอักษรบนพื้นนี้ต้องเป็นสีขาวเท่านั้น (ตรวจคอนทราสต์ทั้งสองปลายแล้ว)
 */
export function GradientHeader({
  children,
  tone = "hero",
  backLabel,
  onBack,
  style,
}: {
  children: ReactNode;
  tone?: "hero" | "warn";
  backLabel?: string;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={gradients[tone]}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={[styles.gradient, { paddingTop: insets.top + (onBack ? 2 : 10) }, style]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel ? `กลับไป${backLabel}` : "ย้อนกลับ"}
          hitSlop={6}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.onPrimary} />
          {backLabel ? (
            <AppText variant="label" color={colors.onPrimaryMuted}>
              {backLabel}
            </AppText>
          ) : null}
        </Pressable>
      ) : null}
      {children}
    </LinearGradient>
  );
}

/** ป้ายโปร่งบนพื้นไล่เฉด เช่น "✓ เปิดเตือน 18:00" */
export function HeroPill({
  label,
  tone = "glass",
  icon,
}: {
  label: string;
  tone?: "glass" | "warn";
  icon?: ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  return (
    <View style={[styles.heroPill, tone === "warn" && styles.heroPillWarn]}>
      {icon ? (
        <MaterialCommunityIcons name={icon} size={14} color={tone === "warn" ? colors.onWarnBright : colors.onPrimary} />
      ) : null}
      <AppText
        variant="meta"
        weight={tone === "warn" ? "bold" : "semibold"}
        color={tone === "warn" ? colors.onWarnBright : colors.onPrimary}
      >
        {label}
      </AppText>
    </View>
  );
}

/** หัวข้อย่อยในหน้า เช่น "ทั้งวัน" "วันนี้" พร้อมลิงก์ด้านขวา */
export function SectionLabel({
  label,
  right,
  onPressRight,
}: {
  label: string;
  right?: string;
  onPressRight?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <AppText variant="label" weight="bold" color={colors.textSoft} accessibilityRole="header">
        {label}
      </AppText>
      {right ? (
        <Pressable onPress={onPressRight} disabled={!onPressRight} accessibilityRole={onPressRight ? "link" : undefined} hitSlop={8}>
          <AppText variant="meta" weight="semibold" color={colors.primaryText}>
            {right}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 12,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: colors.background,
  },
  topBarTitle: {
    flex: 1,
    textAlign: "center",
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.small,
  },
  pressed: {
    opacity: 0.6,
  },
  gradient: {
    paddingHorizontal: 22,
    paddingBottom: 22,
    borderBottomLeftRadius: radius.header,
    borderBottomRightRadius: radius.header,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 44,
    marginLeft: -10,
    marginBottom: 6,
    paddingRight: 8,
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.onPrimaryFaint,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  heroPillWarn: {
    backgroundColor: colors.warnBright,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
