import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { colors, radius } from "../constants/theme";
import { Medication, isLowSupply, mealRelationLabel } from "../types";
import AppText from "./ui/AppText";
import Card from "./ui/Card";

type MedicationCardProps = {
  medication: Medication;
  onPress: () => void;
};

/**
 * การ์ดยา 1 รายการในหน้า "ยาของฉัน"
 *
 * สี่แบบตาม Build Kit แยกกันได้ด้วยรูปทรงและข้อความ ไม่ใช่สีอย่างเดียว
 *   ปกติ     ไอคอนฟ้า "เหลือ N"
 *   ใกล้หมด  ขอบส้ม ไอคอนส้ม "เหลือ N" ตัวหนา
 *   หมดแล้ว  ขอบแดง เลข 0 "หมดแล้ว · ยังเตือนตามเวลาเดิม"
 *   พักไว้    ขอบประ จางลง ไอคอน ⏸ "พักการเตือนไว้"
 */
export default function MedicationCard({ medication, onPress }: MedicationCardProps) {
  const paused = medication.status === "paused";
  const empty = medication.quantity === 0;
  const low = !empty && isLowSupply(medication);

  const schedule = [
    medication.dosage,
    ...medication.reminderTimes,
    medication.mealRelation !== "independent" ? mealRelationLabel[medication.mealRelation] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const meta = paused
    ? `${medication.dosage} · พักการเตือนไว้`
    : empty
      ? "หมดแล้ว · ยังเตือนตามเวลาเดิม"
      : schedule;

  return (
    <Card
      onPress={onPress}
      dashed={paused}
      tone={!paused && empty ? "danger" : !paused && low ? "warn" : undefined}
      style={[styles.card, paused && styles.paused]}
      accessibilityLabel={`${medication.name} ${meta} เหลือ ${medication.quantity}${low ? " ใกล้หมด" : ""} ดูรายละเอียด`}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: paused
              ? colors.neutralTint
              : empty
                ? colors.dangerTint
                : low
                  ? colors.warnTint
                  : colors.primaryTint,
          },
        ]}
      >
        {paused ? (
          <MaterialCommunityIcons name="pause" size={20} color={colors.textMuted} />
        ) : empty ? (
          <AppText variant="itemTitle" color={colors.danger}>
            0
          </AppText>
        ) : (
          <MaterialCommunityIcons name="pill" size={22} color={low ? colors.warn : colors.primary} />
        )}
      </View>

      <View style={styles.text}>
        <View style={styles.titleRow}>
          <AppText variant="itemTitle" color={paused ? colors.textSoft : colors.text} numberOfLines={1} style={styles.name}>
            {medication.name}
          </AppText>
          {!paused && !empty ? (
            <AppText variant="meta" weight={low ? "bold" : "medium"} color={low ? colors.warnText : colors.textMuted}>
              {`เหลือ ${medication.quantity}`}
            </AppText>
          ) : null}
        </View>
        <AppText
          variant="small"
          weight={empty && !paused ? "semibold" : "regular"}
          color={empty && !paused ? colors.dangerText : colors.textMuted}
          numberOfLines={2}
        >
          {meta}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  paused: {
    opacity: 0.75,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flexShrink: 1,
  },
});
