import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { foodIcon } from "../constants/foodIcons";
import { mealStyle } from "../constants/mealStyle";
import { colors, severityMeta } from "../constants/theme";
import { formatTime } from "../services/schedule";
import { Meal, SeverityLevel, mealTypeLabel } from "../types";
import AppText from "./ui/AppText";
import Hatch from "./ui/Hatch";
import SeverityBars from "./ui/SeverityBars";
import Tag from "./ui/Tag";

const MAX_TAGS = 4;

export type MealWarning = {
  severity: SeverityLevel;
  /** เช่น "Warfarin กับ ผักใบเขียว" */
  text: string;
};

type MealCardProps = {
  meal: Meal;
  /** code → ชื่อหมวดภาษาไทย ส่งมาจากหน้าจอเพื่อไม่ต้องดึงซ้ำทุกใบ */
  foodLabels: Record<string, string>;
  /** หมวดอาหารในมื้อนี้ที่ตีกับยาที่ผู้ใช้กินอยู่ แสดงเป็นป้ายส้ม */
  riskCodes: string[];
  /** คำเตือนที่บันทึกไว้ตอนบันทึกมื้อนี้ (ระดับสูงสุด) */
  warning: MealWarning | null;
  /** URL ชั่วคราวของรูปอาหาร null = ไม่มีรูป หรือขอ URL ไม่สำเร็จเพราะออฟไลน์ */
  photoUrl?: string | null;
  onPress: () => void;
};

/**
 * การ์ดมื้ออาหาร 1 มื้อ (หน้า 07)
 *
 * แถบล่างสีตามระดับคำเตือน ให้เปิดไดอารี่ย้อนหลังแล้วเห็นทันทีว่ามื้อไหนควรระวัง
 * ถ้ารูปโหลดไม่ได้ จะบอกตรง ๆ ว่าโหลดไม่ได้ ไม่ปล่อยช่องว่างให้ผู้ใช้สงสัยว่ารูปหาย
 */
export default function MealCard({ meal, foodLabels, riskCodes, warning, photoUrl, onPress }: MealCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  // ไม่มีรูป ใช้ไอคอนประจำมื้อบนพื้นสีของช่วงเวลาแทน การ์ดจะได้ไม่ดูว่างเปล่า
  const palette = mealStyle(meal.mealType);
  const risky = meal.foodCodes.filter((code) => riskCodes.includes(code));
  const others = meal.foodCodes.filter((code) => !riskCodes.includes(code));
  const ordered = [...risky, ...others];
  const shown = ordered.slice(0, MAX_TAGS);
  const hidden = ordered.length - shown.length;

  // มีหมวดที่ตีกับยาแต่ไม่มีคำเตือนที่บันทึกไว้ (เช่นบันทึกตอนออฟไลน์) ยังต้องบอกให้เห็น
  const footer: MealWarning | null =
    warning ?? (risky.length > 0 ? { severity: "moderate", text: "อาจตีกับยาที่กินอยู่" } : null);
  const footerMeta = footer ? severityMeta[footer.severity] : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${palette.label} ${formatTime(meal.eatenAt)} ${meal.name}${
        footer ? ` ${footerMeta?.label} ${footer.text}` : ""
      } แตะเพื่อแก้ไข`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        {meal.photoPath && photoUrl && !photoFailed ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            onError={() => setPhotoFailed(true)}
            accessibilityLabel={`รูป ${meal.name}`}
          />
        ) : meal.photoPath ? (
          // มีรูปแต่โหลดไม่ได้ ใช้ลายทางเพราะเป็นสิ่งที่ "ยังไม่รู้" ไม่ใช่ไม่มี
          <Hatch style={styles.photoPlaceholder}>
            <AppText variant="tiny" weight="regular" color={colors.textMuted} align="center">
              {"โหลดรูป\nไม่ได้"}
            </AppText>
          </Hatch>
        ) : (
          <View style={[styles.photo, styles.iconTile, { backgroundColor: palette.background }]}>
            <MaterialCommunityIcons name={palette.icon} size={32} color={palette.color} />
          </View>
        )}

        <View style={styles.text}>
          <View style={styles.metaRow}>
            <AppText variant="small" weight="bold" color={colors.textSoft}>
              {formatTime(meal.eatenAt)}
            </AppText>
            <View style={[styles.mealTag, { backgroundColor: palette.background }]}>
              <AppText variant="tiny" weight="bold" color={palette.color}>
                {palette.label}
              </AppText>
            </View>
          </View>
          <AppText variant="itemTitle" numberOfLines={2}>
            {meal.name || mealTypeLabel[meal.mealType]}
          </AppText>
          {shown.length > 0 ? (
            <View style={styles.tags}>
              {shown.map((code) => (
                <Tag
                  key={code}
                  label={foodLabels[code] ?? code}
                  icon={foodIcon(code)}
                  tone={risky.includes(code) ? "warn" : "neutral"}
                />
              ))}
              {hidden > 0 ? <Tag label={`+${hidden}`} /> : null}
            </View>
          ) : null}
        </View>
      </View>

      {footer && footerMeta ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor:
                footer.severity === "major"
                  ? colors.dangerTint
                  : footer.severity === "moderate"
                    ? colors.warnSurface
                    : colors.neutralTint,
            },
          ]}
        >
          <SeverityBars
            level={footer.severity}
            color={footer.severity === "major" ? colors.danger : footerMeta.color}
          />
          <AppText
            variant="meta"
            weight="regular"
            color={footer.severity === "major" ? colors.dangerDeep : footer.severity === "moderate" ? colors.warnText : colors.textSoft}
            style={styles.footerText}
            numberOfLines={2}
          >
            <AppText
              variant="meta"
              weight="bold"
              color={footer.severity === "major" ? colors.dangerDeep : footer.severity === "moderate" ? colors.warnText : colors.textSoft}
            >
              {footerMeta.label}
            </AppText>
            {` ${footer.text}`}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.85,
  },
  main: {
    flexDirection: "row",
    gap: 13,
    padding: 14,
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: colors.neutralTint,
  },
  iconTile: {
    alignItems: "center",
    justifyContent: "center",
  },
  mealTag: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  photoPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.dashed,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  footerText: {
    flex: 1,
  },
});
