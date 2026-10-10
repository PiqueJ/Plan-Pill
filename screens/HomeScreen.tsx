import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { ComponentProps, useCallback, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DoseRow from "../components/DoseRow";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { SectionLabel } from "../components/ui/Headers";
import ProgressRing from "../components/ui/ProgressRing";
import UndoBar, { nextUndoKey } from "../components/ui/UndoBar";
import { useLightStatusBar } from "../components/ui/useLightStatusBar";
import {
  DISCLAIMER,
  Period,
  colors,
  gradientDirection,
  gradients,
  periodPalette,
  radius,
  severityMeta,
} from "../constants/theme";
import { getAlerts } from "../services/alerts";
import { showMessage } from "../services/dialog";
import { DoseRecordResult, recordDoseTaken, skipDose, undoDoseRecord } from "../services/doses";
import { getFoodCategoryLabels } from "../services/drugs";
import { getMeals } from "../services/meals";
import { openFromTab } from "../services/navigation";
import { SNOOZE_MINUTES, scheduleSnoozeReminder } from "../services/notifications";
import {
  Snoozes,
  addSnooze,
  clearSnooze,
  dueSnoozes,
  getSnoozes,
  requestBrowserNotification,
  showBrowserNotification,
  snoozedUntil,
} from "../services/snooze";
import {
  buildTodayDoses,
  canBackfill,
  describeRelative,
  formatTime,
  formatWeekdayLong,
  isSameDay,
  isWithinDoseWindow,
  periodOf,
  syncDoseLogs,
} from "../services/schedule";
import { getDoseLogs, getMedications } from "../services/storage";
import { mealStyle } from "../constants/mealStyle";
import { DoseLog, InteractionAlert, Meal, Medication, isLowSupply, mealRelationLabel } from "../types";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** รีเฟรชสถานะทุก 30 วินาที ให้ "ยังไม่ถึงเวลา" เปลี่ยนเป็น "ถึงเวลาแล้ว" เองโดยไม่ต้องปิดแอป */
const REFRESH_INTERVAL_MS = 30 * 1000;

const PERIOD_ORDER: Period[] = ["morning", "noon", "evening", "night"];

const GREETING: Record<Exclude<Period, "snack">, string> = {
  morning: "สวัสดีตอนเช้า",
  noon: "สวัสดีตอนกลางวัน",
  evening: "สวัสดีตอนเย็น",
  night: "ราตรีสวัสดิ์",
};

type Undo = { key: number; message: string; result: DoseRecordResult };

/**
 * หน้า 03 วันนี้
 *
 * หัวไล่เฉดรวมทุกอย่างที่ต้องรู้ในแวบเดียว: วงแหวนความคืบหน้า ตัวเลขสรุป และสิ่งที่ต้องทำตอนนี้
 * ถ้ามีมื้อที่ถึงเวลา ปุ่ม "บันทึกว่ากินแล้ว" อยู่ในหัวเลย ไม่ต้องเลื่อนหา
 *
 * ด้านล่างจัดมื้อยาตามช่วงเวลา (เช้า กลางวัน เย็น ก่อนนอน) พร้อมสีประจำช่วง
 * และแถบมื้ออาหารวันนี้ ให้เห็นยากับอาหารในหน้าเดียวกัน ซึ่งเป็นใจความของแอป
 *
 * บันทึกด้วยการแตะครั้งเดียว ไม่มีกล่องถามซ้ำ ถ้ากดผิดมีแถบ "เลิกทำ" 6 วินาที
 */
export default function HomeScreen() {
  useLightStatusBar();

  const insets = useSafeAreaInsets();
  const [doses, setDoses] = useState<DoseLog[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const [flaggedMeals, setFlaggedMeals] = useState<Record<string, InteractionAlert>>({});
  const [todayAlerts, setTodayAlerts] = useState<InteractionAlert[]>([]);
  const [foodLabels, setFoodLabels] = useState<Record<string, string>>({});
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDoseId, setBusyDoseId] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [snoozes, setSnoozes] = useState<Snoozes>({});

  const loadDashboard = useCallback(async () => {
    // ปิดรอบของมื้อที่ผ่านไปแล้วให้เรียบร้อยก่อน แล้วค่อยสร้างมื้อของวันนี้
    await syncDoseLogs();

    const [savedMedications, logs, alerts, labels, meals, savedSnoozes] = await Promise.all([
      getMedications(),
      getDoseLogs(),
      getAlerts(),
      getFoodCategoryLabels(),
      getMeals(),
      getSnoozes(),
    ]);

    const currentTime = new Date();
    const foodAlerts = alerts.filter((alert) => alert.kind === "drug_food");
    const byMeal: Record<string, InteractionAlert> = {};

    for (const alert of foodAlerts) {
      if (!alert.mealId) continue;
      const current = byMeal[alert.mealId];
      if (!current || severityMeta[alert.severity].rank > severityMeta[current.severity].rank) {
        byMeal[alert.mealId] = alert;
      }
    }

    setNow(currentTime);
    setMedications(savedMedications);
    const todayDoses = buildTodayDoses(savedMedications, logs, currentTime);
    setDoses(todayDoses);

    // บนเว็บไม่มีระบบแจ้งเตือนของเครื่อง แอปจึงเตือนมื้อที่เลื่อนไว้เองเมื่อถึงเวลา (หน้านี้รีเฟรชทุก 30 วินาที)
    let activeSnoozes = savedSnoozes;
    if (Platform.OS === "web") {
      const due = dueSnoozes(savedSnoozes, currentTime);

      for (const doseId of due) {
        await clearSnooze(doseId);
        const dose = todayDoses.find((item) => item.id === doseId);

        if (dose && (dose.status === "reminded" || dose.status === "upcoming")) {
          showMessage("ถึงเวลารับประทานยา", `${dose.medicationName} ${dose.dosage} · นัด ${formatTime(dose.scheduledAt)}`);
          showBrowserNotification("เตือนอีกครั้ง: ถึงเวลารับประทานยา", `${dose.medicationName} ${dose.dosage}`);
        }
      }

      if (due.length > 0) {
        activeSnoozes = await getSnoozes();
      }
    }
    setSnoozes(activeSnoozes);
    setTodayMeals(
      meals
        .filter((meal) => isSameDay(new Date(meal.eatenAt), currentTime))
        .sort((a, b) => a.eatenAt.localeCompare(b.eatenAt))
    );
    setFlaggedMeals(byMeal);
    setTodayAlerts(foodAlerts.filter((alert) => isSameDay(new Date(alert.createdAt), currentTime)));
    setFoodLabels(labels);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();

      const interval = setInterval(loadDashboard, REFRESH_INTERVAL_MS);

      return () => clearInterval(interval);
    }, [loadDashboard])
  );

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRecord(dose: DoseLog) {
    setBusyDoseId(dose.id);
    await clearSnooze(dose.id);

    try {
      const result = await recordDoseTaken(dose);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const remaining =
        result.medication && isLowSupply(result.medication) ? ` · ยาเหลือ ${result.medication.quantity}` : "";
      setUndo({
        key: nextUndoKey(),
        message: `บันทึกแล้ว ${formatTime(result.dose.takenAt ?? dose.scheduledAt)}${remaining}`,
        result,
      });
      await loadDashboard();
    } finally {
      setBusyDoseId(null);
    }
  }

  async function handleSkip(dose: DoseLog) {
    setBusyDoseId(dose.id);
    await clearSnooze(dose.id);

    try {
      const result = await skipDose(dose);
      setUndo({ key: nextUndoKey(), message: `ข้าม ${dose.medicationName} มื้อ ${formatTime(dose.scheduledAt)} แล้ว`, result });
      await loadDashboard();
    } finally {
      setBusyDoseId(null);
    }
  }

  async function handleUndo() {
    if (!undo) {
      return;
    }

    const { result } = undo;
    setUndo(null);
    await undoDoseRecord(result);
    await loadDashboard();
  }

  async function handleSnooze(dose: DoseLog) {
    const medication = medications.find((item) => item.id === dose.medicationId);

    if (!medication) {
      return;
    }

    if (Platform.OS === "web") {
      // เว็บ: แอปจำเวลาไว้แล้วเด้งเตือนเอง ขออนุญาตแจ้งเตือนของเบราว์เซอร์เพิ่มเผื่อผู้ใช้สลับไปแท็บอื่น
      const until = await addSnooze(dose.id, SNOOZE_MINUTES);
      setSnoozes(await getSnoozes());
      showMessage(
        `เลื่อนไป ${SNOOZE_MINUTES} นาทีแล้ว`,
        `จะเตือน ${medication.name} อีกครั้งเวลา ${formatTime(until)} · เปิดหน้านี้ค้างไว้ แอปจะเด้งเตือนบนหน้าจอ`
      );
      // ไม่รอคำตอบ เบราว์เซอร์อาจถามค้างไว้ ข้อความยืนยันด้านบนต้องขึ้นทันที
      requestBrowserNotification();
      return;
    }

    const notificationId = await scheduleSnoozeReminder(medication, SNOOZE_MINUTES);

    if (!notificationId) {
      showMessage("ตั้งการเตือนไม่สำเร็จ", "ตรวจสิทธิ์การแจ้งเตือนของแอปในตั้งค่าของเครื่อง แล้วลองอีกครั้ง");
      return;
    }

    const until = await addSnooze(dose.id, SNOOZE_MINUTES);
    setSnoozes(await getSnoozes());
    showMessage(`เลื่อนไป ${SNOOZE_MINUTES} นาทีแล้ว`, `จะเตือน ${medication.name} อีกครั้งเวลา ${formatTime(until)}`);
  }

  const activeMedications = medications.filter((item) => item.status === "active");
  const heroDose =
    doses.find(
      (dose) => (dose.status === "reminded" || dose.status === "upcoming") && isWithinDoseWindow(dose.scheduledAt, now)
    ) ?? null;
  const takenCount = doses.filter((dose) => dose.status === "taken").length;
  const dueCount = doses.filter((dose) => dose.status === "reminded").length;
  const missedCount = doses.filter((dose) => dose.status === "missed").length;
  const leftCount = doses.filter((dose) => dose.status === "upcoming" || dose.status === "reminded").length;
  const settledCount = doses.filter((dose) => dose.status === "taken" || dose.status === "skipped").length;
  const nextUpcoming = doses.find((dose) => dose.status === "upcoming" && dose.id !== heroDose?.id) ?? null;
  const allDone = doses.length > 0 && settledCount === doses.length;
  const heroMedication = heroDose ? medications.find((item) => item.id === heroDose.medicationId) : undefined;
  const caution = buildCaution(heroMedication, todayAlerts, foodLabels);
  const currentPeriod = periodOf(now);

  const groups = PERIOD_ORDER.map((period) => ({
    period,
    doses: doses.filter((dose) => dose.id !== heroDose?.id && periodOf(dose.scheduledAt) === period),
  })).filter((group) => group.doses.length > 0);

  if (loading) {
    return <HomeSkeleton topInset={insets.top} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <LinearGradient
          colors={gradients.hero}
          start={gradientDirection.start}
          end={gradientDirection.end}
          style={[styles.header, { paddingTop: insets.top + 14 }]}
        >
          {/* วงกลมจาง ๆ มุมขวาบน ช่วยให้หัวดูมีมิติ เป็นของตกแต่งล้วน */}
          <View style={styles.decorBig} pointerEvents="none" />
          <View style={styles.decorSmall} pointerEvents="none" />

          <View style={styles.headerTop}>
            <View style={styles.flex}>
              <AppText variant="small" color={colors.onPrimaryMuted}>
                {formatWeekdayLong(now)}
              </AppText>
              <AppText variant="title" color={colors.onPrimary} accessibilityRole="header">
                วันนี้
              </AppText>
              <View style={styles.greeting}>
                <MaterialCommunityIcons
                  name={periodPalette[currentPeriod].icon as IconName}
                  size={16}
                  color={colors.onPrimaryMuted}
                />
                <AppText variant="small" color={colors.onPrimaryMuted} style={styles.flex}>
                  {doses.length > 0 ? `${GREETING[currentPeriod]} · วันนี้มียา ${doses.length} มื้อ` : GREETING[currentPeriod]}
                </AppText>
              </View>
            </View>

            {doses.length > 0 ? (
              <View accessible accessibilityLabel={`บันทึกแล้ว ${takenCount} จาก ${doses.length} มื้อ`}>
                <ProgressRing
                  size={80}
                  stroke={8}
                  total={doses.length}
                  trackColor="rgba(255,255,255,0.22)"
                  segments={[
                    { value: takenCount, color: colors.onPrimary },
                    { value: dueCount, color: colors.warnBright },
                  ]}
                >
                  <AppText variant="itemTitle" color={colors.onPrimary}>
                    {`${takenCount}/${doses.length}`}
                  </AppText>
                  <AppText variant="tiny" color={colors.onPrimaryMuted}>
                    มื้อ
                  </AppText>
                </ProgressRing>
              </View>
            ) : null}
          </View>

          {doses.length > 0 ? (
            <View style={styles.stats}>
              <StatPill icon="check-circle" label="บันทึกแล้ว" value={takenCount} />
              <StatPill icon="bell-ring" label="ถึงเวลา" value={dueCount} tone={dueCount > 0 ? "warn" : undefined} />
              <StatPill
                icon={missedCount > 0 ? "alert-circle" : "clock-outline"}
                label={missedCount > 0 ? "ไม่ได้บันทึก" : "เหลือ"}
                value={missedCount > 0 ? missedCount : leftCount}
              />
            </View>
          ) : null}

          <View style={styles.focus}>
            {activeMedications.length === 0 ? (
              <FirstMedicationPanel />
            ) : heroDose ? (
              <DuePanel
                dose={heroDose}
                medication={heroMedication}
                now={now}
                busy={busyDoseId === heroDose.id}
                onRecord={() => handleRecord(heroDose)}
                onSkip={() => handleSkip(heroDose)}
                snoozedUntil={snoozedUntil(snoozes, heroDose.id, now)}
                onSnooze={() => handleSnooze(heroDose)}
              />
            ) : allDone ? (
              <AllDonePanel count={doses.length} next={nextDoseTomorrow(activeMedications)} />
            ) : nextUpcoming ? (
              <NextPanel dose={nextUpcoming} now={now} />
            ) : (
              <View style={styles.panel}>
                <AppText variant="bodyStrong" color={colors.onPrimary}>
                  ไม่มียาที่ต้องกินแล้ววันนี้
                </AppText>
                <AppText variant="small" color={colors.onPrimaryMuted}>
                  มื้อที่เหลือเลยเวลาไปแล้ว ดูรายการด้านล่างเพื่อบันทึกย้อนหลัง
                </AppText>
              </View>
            )}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {caution ? (
            <Pressable
              onPress={caution.open}
              accessibilityRole="button"
              accessibilityLabel={`${caution.title} ${caution.body}`}
              accessibilityHint={caution.openLabel}
              style={({ pressed }) => [styles.caution, pressed && styles.pressed]}
            >
              <View style={styles.cautionIcon}>
                <MaterialCommunityIcons name="food-apple-outline" size={20} color={colors.warnText} />
              </View>
              <View style={styles.flex}>
                <AppText variant="small" weight="bold" color={colors.warnText}>
                  {caution.title}
                </AppText>
                <AppText variant="small" color={colors.textSoft}>
                  {caution.body}
                </AppText>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.warnText} />
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <SectionLabel
              label="มื้ออาหารวันนี้"
              right={todayMeals.length > 0 ? "ไดอารี่ →" : undefined}
              onPressRight={() => router.navigate("/(tabs)/meals" as any)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mealStrip}
              style={styles.mealScroller}
            >
              {todayMeals.map((meal) => (
                <MealMini
                  key={meal.id}
                  meal={meal}
                  alert={flaggedMeals[meal.id]}
                  onPress={() => openFromTab("/(tabs)/meals/edit/[mealId]", "/", { mealId: meal.id })}
                />
              ))}
              <Pressable
                onPress={() => openFromTab("/(tabs)/meals/new", "/")}
                accessibilityRole="button"
                accessibilityLabel="บันทึกมื้ออาหาร"
                style={({ pressed }) => [styles.mealAdd, pressed && styles.pressed]}
              >
                <View style={styles.mealAddIcon}>
                  <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
                </View>
                <AppText variant="label" color={colors.primaryText} align="center">
                  {todayMeals.length === 0 ? "บันทึกมื้อแรก\nของวันนี้" : "บันทึกมื้อ"}
                </AppText>
              </Pressable>
            </ScrollView>
          </View>

          {groups.map((group) => {
            const palette = periodPalette[group.period];
            const done = group.doses.filter((dose) => dose.status === "taken").length;

            return (
              <View key={group.period} style={styles.section}>
                <View style={styles.periodHeader}>
                  <View style={[styles.periodIcon, { backgroundColor: palette.background }]}>
                    <MaterialCommunityIcons name={palette.icon as IconName} size={18} color={palette.color} />
                  </View>
                  <AppText variant="label" weight="bold" color={colors.text} style={styles.flex} accessibilityRole="header">
                    {palette.label}
                  </AppText>
                  <AppText variant="meta" color={colors.textMuted}>
                    {`บันทึกแล้ว ${done}/${group.doses.length}`}
                  </AppText>
                </View>
                <Card padded={false} style={styles.groupCard}>
                  {group.doses.map((dose, index) => (
                    <View key={dose.id} style={index > 0 ? styles.divider : undefined}>
                      <DoseRow
                        dose={dose}
                        now={now}
                        bare
                        onPress={() =>
                          openFromTab("/(tabs)/medications/[medicationId]", "/", { medicationId: dose.medicationId })
                        }
                        onRecord={
                          // มื้อที่เลยเวลาแล้วบันทึกย้อนหลังได้ภายใน 24 ชม. มื้อที่ยังไม่ถึงกดได้ก่อน 30 นาที
                          dose.status === "reminded" ||
                          canBackfill(dose, now) ||
                          (dose.status === "upcoming" && isWithinDoseWindow(dose.scheduledAt, now))
                            ? () => handleRecord(dose)
                            : undefined
                        }
                        recordLabel={dose.status === "missed" ? "บันทึกย้อนหลัง" : "บันทึก"}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            );
          })}

          <AppText variant="meta" weight="regular" color={colors.textMuted} align="center" style={styles.disclaimer}>
            {DISCLAIMER}
          </AppText>
        </View>
      </ScrollView>

      {undo ? <UndoBar key={undo.key} message={undo.message} onUndo={handleUndo} onDone={() => setUndo(null)} /> : null}
    </View>
  );
}

/** ข้อความ "ควรระวังเรื่องอาหาร" ของมื้อที่ต้องกินตอนนี้ หรือคำเตือนจากมื้ออาหารวันนี้ */
function buildCaution(medication: Medication | undefined, alerts: InteractionAlert[], labels: Record<string, string>) {
  if (medication && medication.foodRiskCodes.length > 0) {
    const foods = medication.foodRiskCodes.map((code) => labels[code] ?? code).slice(0, 3).join(" · ");
    return {
      title: "ควรระวังเรื่องอาหาร",
      body: `${medication.name} อาจตีกับ ${foods} · ยืนยันกับเภสัชกร`,
      open: () => openFromTab("/(tabs)/medications/[medicationId]", "/", { medicationId: medication.id }),
      openLabel: `ดูรายละเอียด ${medication.name}`,
    };
  }

  if (alerts.length > 0) {
    return {
      title: `มื้ออาหารวันนี้มีคำเตือน ${alerts.length} รายการ`,
      body: `${alerts[0].messageTh.split(" · ")[0]} · แตะเพื่อดูคำแนะนำ`,
      open: () => router.navigate({ pathname: "/(tabs)/history", params: { tab: "alerts" } } as any),
      openLabel: "ดูคำเตือนในหน้าประวัติ",
    };
  }

  return null;
}

/** มื้อแรกของพรุ่งนี้ ใช้บอกในแผง "บันทึกครบแล้ว" */
function nextDoseTomorrow(medications: Medication[]) {
  let best: { name: string; time: string } | null = null;

  for (const medication of medications) {
    for (const time of medication.reminderTimes) {
      if (!best || time < best.time) {
        best = { name: medication.name, time };
      }
    }
  }

  return best;
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <View style={[styles.statPill, tone === "warn" && styles.statPillWarn]}>
      <MaterialCommunityIcons name={icon} size={16} color={tone === "warn" ? colors.onWarnBright : colors.onPrimary} />
      <View>
        <AppText variant="itemTitle" color={tone === "warn" ? colors.onWarnBright : colors.onPrimary}>
          {value}
        </AppText>
        <AppText variant="tiny" color={tone === "warn" ? colors.onWarnBright : colors.onPrimaryMuted}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function DuePanel({
  dose,
  medication,
  now,
  busy,
  onRecord,
  onSkip,
  onSnooze,
  snoozedUntil: until,
}: {
  dose: DoseLog;
  medication: Medication | undefined;
  now: Date;
  busy: boolean;
  onRecord: () => void;
  onSkip: () => void;
  onSnooze?: () => void;
  /** เลื่อนการเตือนไว้ถึงกี่โมง null = ไม่ได้เลื่อน */
  snoozedUntil: Date | null;
}) {
  const relative = describeRelative(dose.scheduledAt, now);
  const statusText = until
    ? `เลื่อนแล้ว · เตือนอีกครั้ง ${formatTime(until)}`
    : dose.status === "reminded"
      ? `ถึงเวลาแล้ว · ${relative}`
      : `ใกล้ถึงเวลา · ${relative}`;
  const meta = [dose.dosage, medication ? mealRelationLabel[medication.mealRelation] : null].filter(Boolean).join(" · ");

  return (
    <View style={[styles.panel, styles.duePanel]}>
      <View style={styles.dueStatus}>
        <View style={styles.dueDot} />
        <AppText variant="meta" weight="bold" color={colors.onWarnBright}>
          {statusText}
        </AppText>
      </View>

      {/* ชื่อยายาว (เช่น Dextromethorphan) ห้ามหักกลางคำ ให้เวลาลงไปบรรทัดใหม่แทน */}
      <View style={styles.dueMain}>
        <View style={styles.dueName}>
          <AppText variant="drugHero" color={colors.onPrimary} numberOfLines={2}>
            {dose.medicationName}
          </AppText>
          {meta ? (
            <AppText variant="bodyStrong" weight="regular" color={colors.onPrimaryMuted}>
              {meta}
            </AppText>
          ) : null}
        </View>
        <AppText variant="timeHero" color={colors.onPrimary} style={styles.dueTime}>
          {formatTime(dose.scheduledAt)}
        </AppText>
      </View>

      <Button
        label="บันทึกว่ากินแล้ว"
        loadingLabel="กำลังบันทึก…"
        icon="check-bold"
        variant="onHero"
        loading={busy}
        onPress={onRecord}
        accessibilityLabel={`บันทึกว่ากิน ${dose.medicationName} แล้ว`}
      />

      <View style={styles.dueActions}>
        {onSnooze ? (
          <Button
            label={until ? `เลื่อนถึง ${formatTime(until)}` : `เลื่อน ${SNOOZE_MINUTES} นาที`}
            variant="onHeroSecondary"
            onPress={onSnooze}
            // กดซ้ำระหว่างที่เลื่อนอยู่จะได้การเตือนซ้อนกันหลายอัน
            disabled={Boolean(until)}
            style={styles.flex}
          />
        ) : null}
        <Button label="ข้ามมื้อนี้" variant="onHeroSecondary" onPress={onSkip} disabled={busy} style={styles.flex} />
      </View>
    </View>
  );
}

function NextPanel({ dose, now }: { dose: DoseLog; now: Date }) {
  const palette = periodPalette[periodOf(dose.scheduledAt)];

  return (
    <Pressable
      onPress={() => openFromTab("/(tabs)/medications/[medicationId]", "/", { medicationId: dose.medicationId })}
      accessibilityRole="button"
      accessibilityLabel={`มื้อถัดไป ${dose.medicationName} เวลา ${formatTime(dose.scheduledAt)} ${describeRelative(dose.scheduledAt, now)}`}
      style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}
    >
      <View style={[styles.nextIcon, { backgroundColor: palette.background }]}>
        <MaterialCommunityIcons name={palette.icon as IconName} size={24} color={palette.color} />
      </View>
      <View style={styles.flex}>
        <AppText variant="meta" color={colors.textMuted}>
          มื้อถัดไป
        </AppText>
        <AppText variant="itemTitle" numberOfLines={1}>
          {dose.medicationName}
        </AppText>
        <View style={styles.countdown}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={colors.primaryText} />
          <AppText variant="tiny" weight="bold" color={colors.primaryText}>
            {describeRelative(dose.scheduledAt, now)}
          </AppText>
        </View>
      </View>
      <View style={styles.nextTime}>
        <AppText variant="title" color={colors.primaryDeep}>
          {formatTime(dose.scheduledAt)}
        </AppText>
        <AppText variant="tiny" color={colors.textMuted}>
          {dose.dosage}
        </AppText>
      </View>
    </Pressable>
  );
}

function AllDonePanel({ count, next }: { count: number; next: { name: string; time: string } | null }) {
  return (
    <View style={[styles.panel, styles.donePanel]}>
      <View style={styles.doneIcon}>
        <MaterialCommunityIcons name="check-bold" size={26} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="itemTitle" color={colors.onPrimary}>
          {`บันทึกครบ ${count} มื้อแล้ววันนี้`}
        </AppText>
        {next ? (
          <AppText variant="small" color={colors.onPrimaryMuted}>
            {`มื้อถัดไป ${next.name} ${next.time} พรุ่งนี้`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function FirstMedicationPanel() {
  return (
    <View style={styles.panel}>
      <View style={styles.firstIcon}>
        <MaterialCommunityIcons name="pill" size={24} color={colors.onPrimary} />
      </View>
      <AppText variant="heading" color={colors.onPrimary}>
        เพิ่มยาตัวแรกกันค่ะ
      </AppText>
      <AppText variant="body" color={colors.onPrimaryMuted}>
        ใส่ชื่อยาและเวลา แล้วเราจะเตือนให้ ใช้ไม่ถึงหนึ่งนาที
      </AppText>
      <Button
        label="เพิ่มยา"
        icon="plus"
        variant="onHero"
        onPress={() => openFromTab("/(tabs)/medications/new", "/")}
        style={styles.firstButton}
      />
    </View>
  );
}

function MealMini({ meal, alert, onPress }: { meal: Meal; alert?: InteractionAlert; onPress: () => void }) {
  const style = mealStyle(meal.mealType);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${style.label} ${formatTime(meal.eatenAt)} ${meal.name}${
        alert ? ` ${severityMeta[alert.severity].label}` : ""
      }`}
      style={({ pressed }) => [styles.mealCard, pressed && styles.pressed]}
    >
      <View style={styles.mealTop}>
        <View style={[styles.mealIcon, { backgroundColor: style.background }]}>
          <MaterialCommunityIcons name={style.icon} size={20} color={style.color} />
        </View>
        {alert ? (
          <View style={[styles.mealFlag, { backgroundColor: alert.severity === "major" ? colors.danger : colors.warnTint }]}>
            <AppText variant="tiny" weight="bold" color={alert.severity === "major" ? colors.onPrimary : colors.warnText}>
              {`! ${severityMeta[alert.severity].label}`}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="meta" color={style.color}>
        {`${style.label} · ${formatTime(meal.eatenAt)}`}
      </AppText>
      <AppText variant="label" weight="bold" numberOfLines={2}>
        {meal.name}
      </AppText>
    </Pressable>
  );
}

/** โครงสีเทารูปเดียวกับของจริงระหว่างโหลด (Build Kit) ผู้ใช้เห็นว่าจะมีอะไรขึ้นตรงไหน */
function HomeSkeleton({ topInset }: { topInset: number }) {
  return (
    <View style={styles.screen} accessibilityLabel="กำลังโหลดตารางยาวันนี้" accessibilityRole="progressbar">
      <LinearGradient
        colors={gradients.hero}
        start={gradientDirection.start}
        end={gradientDirection.end}
        style={[styles.header, { paddingTop: topInset + 14 }]}
      >
        <View style={[styles.boneLight, { width: 120, height: 12 }]} />
        <View style={[styles.boneLight, { width: 90, height: 26, marginTop: 8 }]} />
        <View style={[styles.boneLight, { height: 150, borderRadius: radius.hero, marginTop: 20 }]} />
      </LinearGradient>
      <View style={styles.body}>
        <View style={[styles.bone, { height: 100, borderRadius: 18 }]} />
        <View style={[styles.bone, { height: 120, borderRadius: 18 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: 96,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: radius.header,
    borderBottomRightRadius: radius.header,
    overflow: "hidden",
  },
  decorBig: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 999,
    top: -90,
    right: -70,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorSmall: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    top: 110,
    left: -50,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  greeting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  stats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  statPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.onPrimaryFaint,
    borderRadius: radius.tile,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statPillWarn: {
    backgroundColor: colors.warnBright,
  },
  focus: {
    marginTop: 14,
  },
  panel: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  duePanel: {
    gap: 12,
  },
  dueStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: colors.warnBright,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  dueDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.onWarnBright,
  },
  dueMain: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    columnGap: 12,
  },
  dueName: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: "100%",
  },
  dueTime: {
    marginLeft: "auto",
  },
  dueActions: {
    flexDirection: "row",
    gap: 9,
  },
  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 14,
  },
  nextIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  countdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginTop: 3,
  },
  nextTime: {
    alignItems: "flex-end",
  },
  donePanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  doneIcon: {
    width: 50,
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.onPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  firstIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.onPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  firstButton: {
    marginTop: 6,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  caution: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.warnSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cautionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.warnTint,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: 9,
  },
  mealScroller: {
    marginHorizontal: -20,
  },
  mealStrip: {
    gap: 10,
    paddingHorizontal: 20,
  },
  mealCard: {
    width: 148,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    gap: 4,
  },
  mealTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 2,
  },
  mealIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mealFlag: {
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  mealAdd: {
    width: 120,
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#97B5CF",
    backgroundColor: colors.tertiary,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 10,
  },
  mealAddIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  periodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  periodIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  groupCard: {
    overflow: "hidden",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  pressed: {
    opacity: 0.8,
  },
  disclaimer: {
    marginTop: 4,
    paddingHorizontal: 8,
  },
  boneLight: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
  },
  bone: {
    backgroundColor: colors.border,
  },
});
