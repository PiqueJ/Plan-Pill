import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DoseRow from "../components/DoseRow";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Card, { EmptyCard } from "../components/ui/Card";
import Hatch from "../components/ui/Hatch";
import { GradientHeader, HeroPill, SectionLabel } from "../components/ui/Headers";
import SeverityBars from "../components/ui/SeverityBars";
import UndoBar, { nextUndoKey } from "../components/ui/UndoBar";
import { useLightStatusBar } from "../components/ui/useLightStatusBar";
import { foodIcon } from "../constants/foodIcons";
import { colors, radius } from "../constants/theme";
import { confirmAction, showMessage } from "../services/dialog";
import { DoseRecordResult, recordDoseTaken, undoDoseRecord } from "../services/doses";
import { getFoodCategoryLabels, getMealGuidance } from "../services/drugs";
import { RETURN_LABEL, closeNested, parseReturnTo } from "../services/navigation";
import { cancelMedicationReminders, setMedicationActive } from "../services/notifications";
import {
  addDays,
  buildTodayDoses,
  formatDayMonth,
  formatThaiDate,
  formatTime,
  canBackfill,
  isWithinDoseWindow,
} from "../services/schedule";
import { deleteMedication, getDoseLogs, getMedicationById } from "../services/storage";
import { DoseLog, Medication, daysOfSupply, isLowSupply, mealRelationLabel } from "../types";

type Undo = { key: number; message: string; result: DoseRecordResult };

/**
 * หน้า 05 รายละเอียดยา
 *
 * หัวไล่เฉดเพราะเป็นหน้าของยาตัวเดียว ข้อมูลอื่นอยู่บนการ์ดขาว
 * ปุ่มลบเป็นลิงก์สีแดงเล็ก ๆ ด้านล่างสุด แยกห่างจากปุ่มแก้ไข กันกดพลาด
 */
export default function MedicationDetailScreen() {
  useLightStatusBar();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ medicationId: string; returnTo?: string }>();
  const medicationId = params.medicationId;
  // เปิดมาจากหน้าวันนี้หรือหน้าประวัติ ปุ่มย้อนกลับต้องพากลับไปที่นั่น
  const returnTo = parseReturnTo(params.returnTo);

  const [medication, setMedication] = useState<Medication | null>(null);
  const [doses, setDoses] = useState<DoseLog[]>([]);
  const [foodLabels, setFoodLabels] = useState<Record<string, string>>({});
  const [guidance, setGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [now, setNow] = useState(new Date());

  const loadDetail = useCallback(async () => {
    const saved = await getMedicationById(medicationId);
    const current = new Date();

    setMedication(saved);
    setNow(current);

    if (saved) {
      const [logs, labels, mealGuidance] = await Promise.all([
        getDoseLogs(),
        getFoodCategoryLabels(),
        saved.drugId ? getMealGuidance(saved.drugId) : Promise.resolve(null),
      ]);

      setDoses(buildTodayDoses([saved], logs, current));
      setFoodLabels(labels);
      setGuidance(mealGuidance);
    }

    setLoading(false);
  }, [medicationId]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail])
  );

  function goBack() {
    closeNested(returnTo, "/medications");
  }

  async function handleRecord(dose: DoseLog) {
    const result = await recordDoseTaken(dose);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setUndo({ key: nextUndoKey(), message: `บันทึกแล้ว ${formatTime(result.dose.takenAt ?? dose.scheduledAt)}`, result });
    await loadDetail();
  }

  async function handleUndo() {
    if (!undo) {
      return;
    }

    const { result } = undo;
    setUndo(null);
    await undoDoseRecord(result);
    await loadDetail();
  }

  async function handleToggleReminders() {
    if (!medication) {
      return;
    }

    const activate = medication.status !== "active";
    setToggling(true);

    try {
      const { remindersScheduled } = await setMedicationActive(medication, activate);
      await loadDetail();

      if (activate && !remindersScheduled) {
        showMessage(
          "เปิดยานี้แล้ว แต่ยังไม่มีเสียงเตือน",
          "ยาจะกลับมาอยู่ในตารางวันนี้ แต่แอปยังไม่ได้รับสิทธิ์แจ้งเตือน เปิดสิทธิ์ได้ที่หน้าตั้งค่า"
        );
      }
    } finally {
      setToggling(false);
    }
  }

  function handleDelete() {
    if (!medication) {
      return;
    }

    confirmAction({
      title: `ลบ ${medication.name}?`,
      message: "การแจ้งเตือนของยานี้จะถูกยกเลิก ประวัติการกินยาที่บันทึกไว้แล้วยังอยู่ในหน้าประวัติ",
      confirmLabel: "ลบทิ้ง",
      destructive: true,
      onConfirm: async () => {
        await cancelMedicationReminders(medication.notificationIds);
        await deleteMedication(medication.id);
        goBack();
      },
    });
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!medication) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
        <EmptyCard
          title="ยานี้ถูกลบไปแล้ว"
          body="อาจลบจากอีกเครื่องของคุณ"
          actionLabel="กลับไปรายการยา"
          actionVariant="primary"
          onAction={() => router.replace("/(tabs)/medications" as any)}
        />
      </View>
    );
  }

  const paused = medication.status === "paused";
  const low = isLowSupply(medication);
  const days = daysOfSupply(medication);
  const endsOn = days !== null ? formatDayMonth(addDays(now, days)) : "–";
  const relation = mealRelationLabel[medication.mealRelation];
  const riskFoods = medication.foodRiskCodes.map((code) => ({ code, label: foodLabels[code] ?? code }));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <GradientHeader backLabel={RETURN_LABEL[returnTo ?? "/medications"]} onBack={goBack}>
          <AppText variant="drugHero" color={colors.onPrimary} accessibilityRole="header">
            {medication.name}
          </AppText>
          <AppText variant="bodyStrong" weight="regular" color={colors.onPrimaryMuted}>
            {[medication.dosage, relation].filter(Boolean).join(" · ")}
          </AppText>
          <View style={styles.pills}>
            <HeroPill
              icon={paused ? "pause" : "bell-ring-outline"}
              label={paused ? "พักการเตือนอยู่" : `เปิดเตือน ${medication.reminderTimes.join(" · ") || "-"}`}
            />
            {medication.quantity === 0 ? (
              <HeroPill tone="warn" icon="alert-circle" label="ยาหมดแล้ว" />
            ) : low ? (
              <HeroPill tone="warn" icon="alert-circle" label={`เหลือ ${medication.quantity}`} />
            ) : null}
          </View>
        </GradientHeader>

        <View style={styles.body}>
          <View style={styles.grid}>
            <InfoTile label="ขนาดต่อครั้ง" value={medication.dosage || "–"} strong />
            <InfoTile label="พอถึงประมาณ" value={endsOn} strong color={low ? colors.warnText : colors.text} />
            <InfoTile label="เทียบมื้อ" value={relation} />
            <InfoTile label="เริ่มบันทึก" value={formatThaiDate(medication.createdAt)} />
          </View>

          {!paused && doses.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel label="มื้อวันนี้" />
              <Card padded={false} style={styles.doseCard}>
                {doses.map((dose, index) => (
                  <View key={dose.id} style={index > 0 ? styles.divider : undefined}>
                    <DoseRow
                      dose={dose}
                      now={now}
                      bare
                      showDosage={false}
                      onRecord={
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
          ) : null}

          {medication.note ? (
            <Card style={styles.note}>
              <AppText variant="meta" weight="regular" color={colors.textMuted}>
                บันทึกของฉัน
              </AppText>
              <AppText variant="body" color={colors.textSoft}>
                {medication.note}
              </AppText>
            </Card>
          ) : null}

          {medication.drugId === null ? (
            <Hatch style={styles.unknown}>
              <AppText variant="small" weight="bold">
                ยานี้ไม่อยู่ในฐานข้อมูล
              </AppText>
              <AppText variant="small" color="#2B3444">
                บันทึกและเตือนได้ตามปกติ แต่ตรวจปฏิกิริยากับยาหรืออาหารให้ไม่ได้ ถามเภสัชกรเพิ่มนะคะ
              </AppText>
            </Hatch>
          ) : riskFoods.length > 0 || guidance ? (
            <View style={styles.foodBox}>
              {riskFoods.length > 0 ? (
                <>
                  <View style={styles.foodTitle}>
                    <SeverityBars level="moderate" color={colors.warnText} />
                    <AppText variant="label" weight="bold" color={colors.warnText}>
                      อาหารที่ควรระวังกับยานี้
                    </AppText>
                  </View>
                  <View style={styles.foodChips}>
                    {riskFoods.map((food) => (
                      <View key={food.code} style={styles.foodChip}>
                        <MaterialCommunityIcons name={foodIcon(food.code).icon} size={16} color={foodIcon(food.code).color} />
                        <AppText variant="small" weight="semibold" color={colors.warnText}>
                          {food.label}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              {guidance ? (
                <AppText variant="small" color={colors.textSoft}>
                  {guidance}
                </AppText>
              ) : null}
              <AppText variant="meta" weight="regular" color={colors.textSoft}>
                ข้อมูลจาก DDInter · ยืนยันกับเภสัชกรว่าต้องเลี่ยงหรือแค่กินให้สม่ำเสมอ
              </AppText>
            </View>
          ) : (
            <View style={styles.noFood}>
              <MaterialCommunityIcons name="check-bold" size={16} color={colors.onHeroText} />
              <AppText variant="small" weight="semibold" color={colors.onHeroText} style={styles.flex}>
                ฐานข้อมูลไม่มีอาหารที่ต้องระวังกับยานี้
              </AppText>
            </View>
          )}

          <View style={styles.actions}>
            <Button
              label="แก้ไขข้อมูลยา"
              variant="secondary"
              size="md"
              style={styles.flex}
              onPress={() => router.push(`/(tabs)/medications/edit/${medication.id}` as any)}
            />
            <Button
              label={paused ? "เปิดเตือน" : "พักเตือน"}
              variant="plain"
              size="md"
              loading={toggling}
              style={styles.toggle}
              onPress={handleToggleReminders}
              accessibilityHint={paused ? "กลับมาเตือนตามเวลาเดิม" : "หยุดเตือนชั่วคราว ข้อมูลยายังอยู่"}
            />
          </View>

          <Pressable onPress={handleDelete} accessibilityRole="button" style={styles.deleteLink} hitSlop={6}>
            <AppText variant="label" color={colors.dangerText} align="center">
              ลบยานี้ออกจากรายการ
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      {undo ? <UndoBar key={undo.key} message={undo.message} onUndo={handleUndo} onDone={() => setUndo(null)} /> : null}
    </View>
  );
}

function InfoTile({ label, value, strong, color = colors.text }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={styles.tile}>
      <AppText variant="meta" weight="regular" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant={strong ? "itemTitle" : "bodyStrong"} color={color} numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  flex: {
    flex: 1,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.cardSm,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  section: {
    gap: 8,
    paddingTop: 2,
  },
  doseCard: {
    overflow: "hidden",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  note: {
    gap: 2,
    borderRadius: 18,
  },
  unknown: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 2,
  },
  foodBox: {
    backgroundColor: colors.warnSurface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 15,
    gap: 9,
  },
  foodTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  foodChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  foodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  noFood: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 4,
  },
  toggle: {
    width: 116,
  },
  deleteLink: {
    minHeight: 44,
    justifyContent: "center",
  },
});
