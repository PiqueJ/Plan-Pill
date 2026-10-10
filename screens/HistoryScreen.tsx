import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import AlertHistory, { groupAlertEvents } from "../components/AlertHistory";
import DoseRow from "../components/DoseRow";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Card, { EmptyCard } from "../components/ui/Card";
import { GradientHeader } from "../components/ui/Headers";
import ProgressBar from "../components/ui/ProgressBar";
import Segmented from "../components/ui/Segmented";
import UndoBar, { nextUndoKey } from "../components/ui/UndoBar";
import { useLightStatusBar } from "../components/ui/useLightStatusBar";
import { colors, radius } from "../constants/theme";
import { getAlerts } from "../services/alerts";
import { chooseOption, showMessage } from "../services/dialog";
import { DoseRecordResult, recordDoseTaken, undoDoseRecord } from "../services/doses";
import { ExportFormat, exportAlerts, exportDoseLogs } from "../services/export";
import {
  BACKFILL_HOURS,
  THAI_WEEKDAY_SHORT,
  addDays,
  canBackfill,
  buildDosesForDay,
  describeDoseTiming,
  formatDayMonth,
  formatWeekRange,
  formatWeekdayShort,
  isSameDay,
  startOfDay,
  startOfWeek,
  syncDoseLogs,
} from "../services/schedule";
import { getFoodCategoryLabels } from "../services/drugs";
import { getMeals } from "../services/meals";
import { openFromTab } from "../services/navigation";
import { getDoseLogs, getMedications } from "../services/storage";
import { DoseLog, InteractionAlert, Meal, Medication } from "../types";

type Mode = "doses" | "alerts";
type Undo = { key: number; message: string; result: DoseRecordResult };

/**
 * หน้า 09 ประวัติ (การกินยา / คำเตือน)
 *
 * แถบปฏิทินสัปดาห์อยู่บนหัวไล่เฉด ฟ้าสำหรับการกินยา ส้มสำหรับคำเตือน
 * แต่ละวันมีแถบเล็กบอกสัดส่วนที่บันทึกแล้ว ผู้ใช้เห็นวันที่ขาดได้ในแวบเดียว
 * มื้อที่ไม่ได้บันทึกยังบันทึกย้อนหลังได้ภายใน 24 ชม. หลังเวลานัด (BACKFILL_HOURS) เกินนั้นปิดไว้
 * เพื่อให้ประวัติที่ส่งให้แพทย์ตรงกับความจริงมากที่สุด
 */
export default function HistoryScreen() {
  useLightStatusBar();

  const [mode, setMode] = useState<Mode>("doses");
  const [now, setNow] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [alertDay, setAlertDay] = useState<Date | null>(null);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [alerts, setAlerts] = useState<InteractionAlert[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [foodCodeByLabel, setFoodCodeByLabel] = useState<Record<string, string>>({});
  // หน้าอื่นส่ง ?tab=alerts มาเพื่อเปิดแท็บคำเตือนตรง ๆ เช่นการ์ดคำเตือนในหน้าวันนี้
  const params = useLocalSearchParams<{ tab?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);

  const loadHistory = useCallback(async () => {
    // ปิดรอบของมื้อที่ผ่านไปแล้ว ประวัติจะครบแม้ผู้ใช้ไม่ได้เปิดแอปตอนนั้น
    await syncDoseLogs();

    const [savedLogs, savedMedications, savedAlerts, savedMeals, labels] = await Promise.all([
      getDoseLogs(),
      getMedications(),
      getAlerts(),
      getMeals(),
      getFoodCategoryLabels(),
    ]);

    setNow(new Date());
    setLogs(savedLogs);
    setMedications(savedMedications);
    setAlerts(savedAlerts);
    setMeals(savedMeals);
    setFoodCodeByLabel(Object.fromEntries(Object.entries(labels).map(([code, label]) => [label, code])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (params.tab === "alerts") {
        setMode("alerts");
        // ใช้คำขอแล้วลบทิ้ง ผู้ใช้สลับกลับไปแท็บการกินยาเองได้ตามปกติ
        router.setParams({ tab: "" });
      }

      loadHistory();
    }, [loadHistory, params.tab])
  );

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await loadHistory();
    } finally {
      setRefreshing(false);
    }
  }

  const today = startOfDay(now);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  /** มื้อยาของวันหนึ่ง: วันนี้คำนวณสด (รวมมื้อที่ยังไม่ถึง) วันก่อนหน้าใช้ประวัติที่บันทึกไว้ */
  function dosesFor(day: Date): DoseLog[] {
    if (day.getTime() > today.getTime()) {
      return [];
    }

    if (isSameDay(day, today)) {
      return buildDosesForDay(medications, logs, day, now);
    }

    return logs
      .filter((log) => isSameDay(new Date(log.scheduledAt), day))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  const weekDoses = days.map(dosesFor);
  const dueSoFar = weekDoses.flat().filter((dose) => dose.status !== "upcoming");
  const takenWeek = dueSoFar.filter((dose) => dose.status === "taken");
  const lateWeek = takenWeek.filter((dose) => describeDoseTiming(dose)?.late).length;
  const missedWeek = dueSoFar.filter((dose) => dose.status === "missed").length;
  const percent = dueSoFar.length > 0 ? Math.round((takenWeek.length / dueSoFar.length) * 100) : null;

  const selectedIndex = days.findIndex((day) => isSameDay(day, selectedDay));
  const selectedDoses = selectedIndex >= 0 ? weekDoses[selectedIndex] : [];
  const selectedTaken = selectedDoses.filter((dose) => dose.status === "taken").length;
  // วันอื่นในสัปดาห์ที่ยังมีมื้อบันทึกย้อนหลังได้ ชวนให้แตะไปบันทึก
  const backfillDay = days.find(
    (day, index) => index !== selectedIndex && weekDoses[index].some((dose) => canBackfill(dose, now))
  );
  const selectedMissed = selectedDoses.filter((dose) => dose.status === "missed");
  const selectedBackfillable = selectedMissed.filter((dose) => canBackfill(dose, now)).length;

  const weekEnd = addDays(weekStart, 7);
  const weekAlerts = alerts.filter((alert) => {
    const time = new Date(alert.createdAt).getTime();
    return time >= weekStart.getTime() && time < weekEnd.getTime();
  });
  const scopedAlerts = weekAlerts.filter((alert) => !alertDay || isSameDay(new Date(alert.createdAt), alertDay));

  function moveWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setAlertDay(null);
    // เลือกวันสุดท้ายของสัปดาห์นั้นที่ไม่เลยวันนี้
    const last = addDays(next, 6);
    setSelectedDay(last.getTime() > today.getTime() ? today : last);
  }

  function backToThisWeek() {
    setWeekStart(startOfWeek(now));
    setSelectedDay(today);
    setAlertDay(null);
  }

  async function handleBackfill(dose: DoseLog) {
    const result = await recordDoseTaken(dose);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setUndo({ key: nextUndoKey(), message: `บันทึกย้อนหลัง ${dose.medicationName} แล้ว`, result });
    await loadHistory();
  }

  async function handleUndo() {
    if (!undo) {
      return;
    }

    const { result } = undo;
    setUndo(null);
    await undoDoseRecord(result);
    await loadHistory();
  }

  async function runExport(format: ExportFormat) {
    setExporting(true);

    try {
      if (mode === "doses") {
        const sorted = [...logs].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
        await exportDoseLogs(sorted, format);
      } else {
        await exportAlerts(alerts, format);
      }
    } catch (error) {
      showMessage(
        "ส่งออกไม่สำเร็จ",
        `${error instanceof Error ? error.message : "ลองอีกครั้ง"} · ประวัติในแอปไม่ได้หายไปไหน ลองอีกครั้งได้เลย`
      );
    } finally {
      setExporting(false);
    }
  }

  function handleExport() {
    chooseOption({
      title: mode === "doses" ? "ส่งออกประวัติการกินยา" : "ส่งออกประวัติคำเตือน",
      message: "ส่งออกทั้งหมด เลือกรูปแบบไฟล์ที่ต้องการ",
      choices: [
        { label: "CSV (เปิดใน Excel)", onPress: () => runExport("csv") },
        { label: "JSON", onPress: () => runExport("json") },
      ],
      webFallbackMessage:
        "การส่งออกไฟล์ใช้ได้เฉพาะบนแอปมือถือ เพราะต้องใช้หน้าต่างแชร์ของระบบ เปิดแอปบนโทรศัพท์แล้วลองอีกครั้ง",
    });
  }

  const isAlerts = mode === "alerts";
  const onHero = colors.onPrimary;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <GradientHeader tone={isAlerts ? "warn" : "hero"} style={styles.header}>
          <View style={styles.weekRow}>
            <View style={styles.weekNav}>
              <Pressable
                onPress={() => moveWeek(-1)}
                accessibilityRole="button"
                accessibilityLabel="สัปดาห์ก่อน"
                hitSlop={8}
                style={styles.arrow}
              >
                <MaterialCommunityIcons name="chevron-left" size={26} color={onHero} />
              </Pressable>
              <AppText variant="heading" color={onHero} accessibilityRole="header">
                {formatWeekRange(weekStart)}
              </AppText>
              <Pressable
                onPress={() => moveWeek(1)}
                disabled={isCurrentWeek}
                accessibilityRole="button"
                accessibilityLabel="สัปดาห์ถัดไป"
                hitSlop={8}
                style={[styles.arrow, isCurrentWeek && styles.arrowDisabled]}
              >
                <MaterialCommunityIcons name="chevron-right" size={26} color={onHero} />
              </Pressable>
            </View>
            <Pressable
              onPress={backToThisWeek}
              disabled={isCurrentWeek && !isAlerts}
              accessibilityRole="button"
              style={styles.weekPill}
            >
              <AppText variant="meta" weight="semibold" color={onHero}>
                {isAlerts ? `${weekAlerts.length} คำเตือน` : isCurrentWeek ? "สัปดาห์นี้" : "กลับสัปดาห์นี้"}
              </AppText>
            </Pressable>
          </View>

          <View style={styles.strip}>
            {days.map((day, index) => {
              const future = day.getTime() > today.getTime();
              const selected = isAlerts ? Boolean(alertDay && isSameDay(day, alertDay)) : isSameDay(day, selectedDay);
              const doses = weekDoses[index];
              const taken = doses.filter((dose) => dose.status === "taken");
              const late = taken.filter((dose) => describeDoseTiming(dose)?.late).length;
              const dayAlerts = weekAlerts.filter((alert) => isSameDay(new Date(alert.createdAt), day));
              const hasMajor = dayAlerts.some((alert) => alert.severity === "major");
              // นับเป็นจำนวนครั้ง (มื้อหรือการเพิ่มยา) ไม่ใช่จำนวนคำเตือน มื้อเดียวที่ตีกับยา 6 ตัวนับเป็น 1
              const dayEvents = groupAlertEvents(dayAlerts).length;
              const textColor = selected ? (isAlerts ? colors.warnText : colors.primaryDeep) : onHero;

              return (
                <Pressable
                  key={day.toISOString()}
                  disabled={future}
                  onPress={() =>
                    isAlerts
                      ? setAlertDay(selected ? null : day)
                      : setSelectedDay(day)
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: future }}
                  accessibilityLabel={`${formatWeekdayShort(day)}${
                    isAlerts ? ` คำเตือน ${dayEvents} ครั้ง` : doses.length > 0 ? ` บันทึก ${taken.length} จาก ${doses.length}` : ""
                  }`}
                  style={[styles.day, selected && styles.daySelected, future && styles.dayFuture]}
                >
                  <AppText variant="tiny" weight={selected ? "semibold" : "regular"} color={textColor} style={!selected && styles.dayLetter}>
                    {THAI_WEEKDAY_SHORT[day.getDay()]}
                  </AppText>
                  <AppText variant="bodyStrong" weight={selected ? "bold" : "semibold"} color={textColor}>
                    {day.getDate()}
                  </AppText>
                  {isAlerts ? (
                    <AppText variant="tiny" weight="bold" color={textColor}>
                      {dayEvents > 0 ? `${hasMajor ? "!" : ""}${dayEvents}` : "–"}
                    </AppText>
                  ) : doses.length > 0 ? (
                    <ProgressBar
                      segments={[
                        { value: taken.length - late, color: selected ? colors.primary : onHero },
                        { value: late, color: selected ? colors.warn : colors.warnBright },
                      ]}
                      total={doses.length}
                      height={4}
                      trackColor={selected ? "#DDE6EF" : "rgba(255,255,255,0.3)"}
                      style={styles.dayBar}
                    />
                  ) : (
                    <View style={styles.dayBarEmpty} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </GradientHeader>

        <View style={styles.body}>
          <Segmented
            options={[
              { value: "doses", label: "การกินยา" },
              // นับเฉพาะสัปดาห์ที่กำลังดู ให้ตรงกับตัวเลขบนหัวหน้า (เดิมนับทั้งหมดตลอดกาล ตัวเลขไม่ตรงกัน)
              { value: "alerts", label: weekAlerts.length > 0 ? `คำเตือน · ${weekAlerts.length}` : "คำเตือน", selectedColor: colors.warnText },
            ]}
            value={mode}
            onChange={setMode}
            accessibilityLabel="ประเภทประวัติ"
          />

          {!isAlerts ? (
            <>
              <View style={styles.stats}>
                <View style={[styles.stat, styles.statWide]}>
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    {isCurrentWeek ? "บันทึกแล้วสัปดาห์นี้" : "บันทึกแล้วสัปดาห์นั้น"}
                  </AppText>
                  <AppText variant="title" color={colors.primaryText}>
                    {percent === null ? "–" : `${percent}%`}
                  </AppText>
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    {`${takenWeek.length} จาก ${dueSoFar.length} มื้อ`}
                  </AppText>
                </View>
                <View style={styles.stat}>
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    ช้ากว่านัด
                  </AppText>
                  <AppText variant="heading" color={colors.warnText}>
                    {lateWeek}
                  </AppText>
                  <AppText variant="tiny" weight="regular" color={colors.textMuted}>
                    มื้อ
                  </AppText>
                </View>
                <View style={styles.stat}>
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    ไม่ได้บันทึก
                  </AppText>
                  <AppText variant="heading" color={colors.textSoft}>
                    {missedWeek}
                  </AppText>
                  <AppText variant="tiny" weight="regular" color={colors.textMuted}>
                    มื้อ
                  </AppText>
                </View>
              </View>

              <View style={styles.dayHeader}>
                <AppText variant="label" weight="bold" accessibilityRole="header">
                  {formatWeekdayShort(selectedDay)}
                </AppText>
                {selectedDoses.length > 0 ? (
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    {`${selectedTaken} จาก ${selectedDoses.length} มื้อ`}
                  </AppText>
                ) : null}
              </View>

              {selectedDoses.length > 0 ? (
                <Card padded={false} style={styles.listCard}>
                  {selectedDoses.map((dose, index) => {
                    const backfillable = canBackfill(dose, now);

                    return (
                      <View key={dose.id} style={index > 0 ? styles.divider : undefined}>
                        <DoseRow
                          dose={dose}
                          now={now}
                          mode="history"
                          bare
                          showDosage={false}
                          onRecord={backfillable ? () => handleBackfill(dose) : undefined}
                          recordLabel="บันทึกย้อนหลัง"
                        />
                      </View>
                    );
                  })}
                </Card>
              ) : (
                <EmptyCard
                  title={isSameDay(selectedDay, today) ? "วันนี้ยังไม่มีมื้อยา" : "ไม่มีรายการในวันนี้"}
                  body={dueSoFar.length === 0 ? "ไม่มีรายการในสัปดาห์นี้" : "เลือกวันอื่นจากแถบด้านบน"}
                  actionLabel="‹ สัปดาห์ก่อน"
                  onAction={() => moveWeek(-1)}
                />
              )}

              {selectedMissed.length > 0 ? (
                <View style={[styles.missedNote, selectedBackfillable === 0 && styles.missedNoteClosed]}>
                  <AppText variant="meta" weight="regular" color={colors.textSoft}>
                    <AppText variant="meta" weight="bold" color={selectedBackfillable > 0 ? colors.warnText : colors.textSoft}>
                      {selectedBackfillable > 0
                        ? `บันทึกย้อนหลังได้อีก ${selectedBackfillable} มื้อ`
                        : "เลยเวลาบันทึกย้อนหลังแล้ว"}
                    </AppText>
                    {` · บันทึกย้อนหลังได้ภายใน ${BACKFILL_HOURS} ชม. หลังเวลานัดเท่านั้น ประวัติที่ส่งให้แพทย์จะได้ตรงกับความจริง`}
                  </AppText>
                </View>
              ) : backfillDay ? (
                <View style={styles.missedNote}>
                  <AppText variant="meta" weight="regular" color={colors.textSoft}>
                    <AppText variant="meta" weight="bold" color={colors.warnText}>
                      {`${formatDayMonth(backfillDay)} ยังไม่ได้บันทึก ${weekDoses[days.indexOf(backfillDay)].filter((dose) => canBackfill(dose, now)).length} มื้อ`}
                    </AppText>
                    {" · แตะวันที่ด้านบนเพื่อบันทึกย้อนหลัง"}
                  </AppText>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <AlertHistory
                key={`${weekStart.toISOString()}-${alertDay?.toISOString() ?? "week"}`}
                alerts={scopedAlerts}
                meals={meals}
                medications={medications}
                foodCodeByLabel={foodCodeByLabel}
                scopeLabel={
                  alertDay
                    ? `วัน${formatWeekdayShort(alertDay)}`
                    : isCurrentWeek
                      ? "สัปดาห์นี้"
                      : `สัปดาห์ ${formatWeekRange(weekStart)}`
                }
                onShowWeek={alertDay ? () => setAlertDay(null) : undefined}
                onOpenMeal={(mealId) => openFromTab("/(tabs)/meals/edit/[mealId]", "/history", { mealId })}
                onOpenMedication={(medicationId) =>
                  openFromTab("/(tabs)/medications/[medicationId]", "/history", { medicationId })
                }
              />

              {scopedAlerts.length === 0 && !alertDay ? (
                <Button label="‹ ดูสัปดาห์ก่อน" variant="tint" size="md" onPress={() => moveWeek(-1)} />
              ) : null}

              <AppText variant="tiny" weight="regular" color={colors.textMuted}>
                ข้อมูลเพื่อการศึกษา ยืนยันกับเภสัชกรหรือแพทย์ทุกครั้ง
              </AppText>
            </>
          )}

          <Button
            label={isAlerts ? "ส่งออกคำเตือนให้เภสัชกรดู" : "ส่งออกให้เภสัชกรหรือแพทย์ดู"}
            variant="secondary"
            size="md"
            loading={exporting}
            loadingLabel="กำลังสร้างไฟล์…"
            onPress={handleExport}
            disabled={isAlerts ? alerts.length === 0 : logs.length === 0}
          />
        </View>
      </ScrollView>

      {undo ? <UndoBar key={undo.key} message={undo.message} onUndo={handleUndo} onDone={() => setUndo(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 110,
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 16,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  arrow: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  weekPill: {
    backgroundColor: colors.onPrimaryFaint,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  strip: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 14,
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: radius.field,
  },
  daySelected: {
    backgroundColor: colors.surface,
  },
  dayFuture: {
    opacity: 0.45,
  },
  dayLetter: {
    opacity: 0.85,
  },
  dayBar: {
    width: 24,
  },
  dayBarEmpty: {
    width: 24,
    height: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 12,
  },
  stats: {
    flexDirection: "row",
    gap: 8,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  statWide: {
    flex: 1.3,
    paddingHorizontal: 14,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: 2,
  },
  listCard: {
    overflow: "hidden",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  missedNote: {
    backgroundColor: colors.warnSurface,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  missedNoteClosed: {
    backgroundColor: colors.neutralTint,
  },
});
