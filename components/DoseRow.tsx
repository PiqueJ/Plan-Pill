import { Pressable, StyleSheet, View } from "react-native";
import { colors, doseStatusMeta } from "../constants/theme";
import { describeDoseTiming, describeRelative, formatDayMonth, formatTime, isSameDay } from "../services/schedule";
import { DoseLog } from "../types";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import StatusDot from "./ui/StatusDot";

type DoseRowProps = {
  dose: DoseLog;
  now: Date;
  /**
   * today   = รายการในหน้าวันนี้ แสดงเวลาถอยหลัง
   * history = หน้าประวัติ แสดงผลตรงเวลา/สายทางขวา
   */
  mode?: "today" | "history";
  onPress?: () => void;
  /** ปุ่มบันทึกทางขวา (มื้อที่ถึงเวลาหรือเลยเวลาแล้ว) */
  onRecord?: () => void;
  recordLabel?: string;
  /** แสดงขนาดยาต่อท้ายชื่อ */
  showDosage?: boolean;
  /** ไม่วาดพื้นการ์ดของตัวเอง ใช้เมื่อวางเรียงกันในการ์ดเดียว */
  bare?: boolean;
};

/** "08:04" หรือ "23 ก.ย. 11:44" ถ้ากดคนละวันกับวันที่นัด (บันทึกย้อนหลัง) */
function pressedAt(dose: DoseLog) {
  if (!dose.takenAt) {
    return "-";
  }

  const taken = new Date(dose.takenAt);
  return isSameDay(taken, new Date(dose.scheduledAt))
    ? formatTime(taken)
    : `${formatDayMonth(taken)} ${formatTime(taken)}`;
}

function metaLine(dose: DoseLog, now: Date, mode: "today" | "history") {
  const time = formatTime(dose.scheduledAt);
  const prefix = mode === "history" ? `นัด ${time}` : time;

  switch (dose.status) {
    case "taken":
      return `${prefix} · กด ${pressedAt(dose)}`;
    case "skipped":
      return `${prefix} · ข้ามแล้ว`;
    case "missed":
      // สั้นพอที่จะไม่โดนปุ่ม "บันทึกย้อนหลัง" ทางขวาเบียดจนขาด
      return `${prefix} · ไม่ได้กด`;
    case "reminded":
      return `${prefix} · ถึงเวลาแล้ว`;
    default:
      return mode === "history" ? prefix : `${prefix} · ${describeRelative(dose.scheduledAt, now)}`;
  }
}

function resultLabel(dose: DoseLog) {
  if (dose.status === "taken") {
    const timing = describeDoseTiming(dose);
    return timing?.late
      ? { text: timing.label, color: colors.warnText, bold: true }
      : { text: "ตรงเวลา", color: colors.primaryText, bold: true };
  }

  switch (dose.status) {
    case "skipped":
      return { text: "ข้าม", color: colors.textMuted, bold: false };
    case "reminded":
      return { text: "รอบันทึก", color: colors.warnText, bold: true };
    case "missed":
      return { text: "ไม่ได้บันทึก", color: colors.dangerText, bold: true };
    default:
      return { text: "ยังไม่ถึง", color: colors.textMuted, bold: false };
  }
}

/**
 * แถวมื้อยา 1 มื้อ: วงสถานะ · ชื่อยา · เวลา · ผลหรือปุ่ม
 *
 * ส่วนที่แตะเพื่อดูรายละเอียดกับปุ่มบันทึกเป็นปุ่มคนละตัววางข้างกัน ไม่ซ้อนกัน
 * (ปุ่มซ้อนปุ่มผิดกติกา HTML บนเว็บ และโปรแกรมอ่านหน้าจออ่านรวมกันจนแยกไม่ออก)
 *
 * มื้อที่บันทึกแล้วจางลงเล็กน้อย (Build Kit) ให้สายตาไปหยุดที่มื้อที่ยังต้องทำ
 */
export default function DoseRow({
  dose,
  now,
  mode = "today",
  onPress,
  onRecord,
  recordLabel = "บันทึก",
  showDosage = true,
  bare = false,
}: DoseRowProps) {
  const hour = formatTime(dose.scheduledAt).slice(0, 2);
  const result = resultLabel(dose);
  const title = showDosage && dose.dosage ? `${dose.medicationName} ${dose.dosage}` : dose.medicationName;
  const meta = metaLine(dose, now, mode);
  const statusText = mode === "history" ? result.text : doseStatusMeta[dose.status].label;
  const label = `${dose.medicationName} ${meta} ${statusText}`;

  const main = (
    <>
      <StatusDot status={dose.status} hour={hour} size={mode === "history" ? 30 : 34} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" color={dose.status === "skipped" ? colors.textSoft : colors.text} numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="meta" weight="regular" color={colors.textMuted} numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      {!onRecord && mode === "history" ? (
        <AppText variant="meta" weight={result.bold ? "bold" : "medium"} color={result.color}>
          {result.text}
        </AppText>
      ) : null}
    </>
  );

  return (
    <View style={[styles.row, !bare && styles.card, mode === "today" && dose.status === "taken" && styles.done]}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${label} ดูรายละเอียดยา`}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          {main}
        </Pressable>
      ) : (
        <View style={styles.main} accessible accessibilityLabel={label}>
          {main}
        </View>
      )}
      {onRecord ? (
        <Button
          label={recordLabel}
          onPress={onRecord}
          variant="tint"
          size="sm"
          accessibilityLabel={`${recordLabel} ${dose.medicationName} มื้อ ${formatTime(dose.scheduledAt)}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 58,
    paddingRight: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingLeft: 14,
  },
  done: {
    opacity: 0.8,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.7,
  },
});
