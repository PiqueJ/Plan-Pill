import { MaterialCommunityIcons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DrugSearchInput from "../components/DrugSearchInput";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Chip from "../components/ui/Chip";
import { FormTopBar } from "../components/ui/Headers";
import InteractionNotice from "../components/ui/InteractionNotice";
import ProgressBar from "../components/ui/ProgressBar";
import SeverityBars from "../components/ui/SeverityBars";
import Stepper from "../components/ui/Stepper";
import TextField from "../components/ui/TextField";
import { foodIcon } from "../constants/foodIcons";
import { colors, radius } from "../constants/theme";
import { recordDrugDrugAlerts } from "../services/alerts";
import { showMessage } from "../services/dialog";
import { checkDrugDrug, getFoodCategoryLabels, getFoodRiskCodes, getMealGuidance } from "../services/drugs";
import { closeNested, parseReturnTo } from "../services/navigation";
import {
  cancelMedicationReminders,
  requestNotificationPermission,
  rescheduleMedicationReminders,
  scheduleMedicationReminders,
} from "../services/notifications";
import { addMedication, getMedicationById, getMedications, updateMedication } from "../services/storage";
import { MedicationErrors, hasErrors, isValidTime, normalizeTime, validateMedication } from "../services/validation";
import { DrugDrugResult, DrugSearchResult, MealRelation, Medication, mealRelationLabel } from "../types";

/** เวลาที่คนส่วนใหญ่ใช้ กดเลือกได้เลยไม่ต้องพิมพ์ */
const PRESET_TIMES = ["06:00", "08:00", "12:00", "18:00", "20:00"];

const MEAL_RELATIONS: MealRelation[] = ["before_meal", "after_meal", "with_meal", "independent"];

const REQUIRED_FIELDS = 4;

type FieldKey = "name" | "amount" | "times";

/**
 * หน้า 06 เพิ่ม / แก้ไขยา
 *
 * ตรวจยาตีกันทันทีที่เลือกชื่อยา ไม่รอตอนกดบันทึก ผู้ใช้จะได้รู้ก่อนกรอกช่องอื่น
 * ผลตรวจไม่บล็อกการบันทึก เพราะการตัดสินใจหยุดยาเป็นของแพทย์ ไม่ใช่ของแอป
 *
 * ถ้ากดบันทึกแล้วยังกรอกไม่ครบ จะขึ้นสรุป "ยังขาด N ช่อง" พร้อมปุ่มพาไปช่องนั้น
 */
export default function MedicationFormScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ medicationId?: string; name?: string; returnTo?: string }>();
  const medicationId = params.medicationId;
  // เปิดมาจากหน้าวันนี้ (ยังไม่มียา) ปิดแล้วต้องกลับไปหน้าวันนี้
  const returnTo = parseReturnTo(params.returnTo);
  const isEditing = Boolean(medicationId);

  const [name, setName] = useState(params.name ?? "");
  const [dosage, setDosage] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [reminderTimes, setReminderTimes] = useState<string[]>(["08:00"]);
  const [customTime, setCustomTime] = useState("");
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [customTimeError, setCustomTimeError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<MedicationErrors>({});
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [otherMedications, setOtherMedications] = useState<Medication[]>([]);

  // ยาที่จับคู่กับฐานข้อมูลอ้างอิงแล้ว null = ผู้ใช้พิมพ์ชื่อเอง ตรวจปฏิกิริยาไม่ได้
  const [drugId, setDrugId] = useState<string | null>(null);
  const [drugCategoryTh, setDrugCategoryTh] = useState<string | null>(null);
  const [foodRiskCodes, setFoodRiskCodes] = useState<string[]>([]);
  const [foodLabels, setFoodLabels] = useState<Record<string, string>>({});
  /** null = ยังไม่ได้ตรวจ หรือตรวจไม่สำเร็จ ต่างจาก [] ที่แปลว่าตรวจแล้วไม่พบ */
  const [drugConflicts, setDrugConflicts] = useState<DrugDrugResult[] | null>(null);
  const [mealRelation, setMealRelation] = useState<MealRelation>("independent");
  const [mealGuidance, setMealGuidance] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<FieldKey, number>>({ name: 0, amount: 0, times: 0 });

  useEffect(() => {
    async function load() {
      const all = await getMedications();
      setOtherMedications(all.filter((item) => item.id !== medicationId));

      if (!medicationId) {
        return;
      }

      const medication = all.find((item) => item.id === medicationId);

      if (!medication) {
        return;
      }

      setName(medication.name);
      setDosage(medication.dosage);
      setQuantity(String(medication.quantity));
      setNote(medication.note);
      setReminderTimes(medication.reminderTimes);
      setIsActive(medication.status === "active");
      setDrugId(medication.drugId);
      setFoodRiskCodes(medication.foodRiskCodes);
      setMealRelation(medication.mealRelation);

      if (medication.drugId) {
        // ตรวจใหม่ตอนเปิดฟอร์มแก้ไข ให้เห็นปฏิกิริยาที่มีอยู่จริงตอนนี้
        // และตอนกดบันทึกจะมีผลตรวจสด ๆ ไปอัปเดตประวัติคำเตือน
        setChecking(true);

        try {
          const [guidance, conflicts, labels] = await Promise.all([
            getMealGuidance(medication.drugId),
            checkDrugDrug(medication.drugId),
            getFoodCategoryLabels(),
          ]);

          setMealGuidance(guidance);
          setDrugConflicts(conflicts);
          setFoodLabels(labels);
        } finally {
          setChecking(false);
        }
      }
    }

    load();
  }, [medicationId]);

  async function handleSelectDrug(drug: DrugSearchResult) {
    setName(drug.nameEn);
    setDrugId(drug.id);
    setDrugCategoryTh(drug.categoryTh);
    setErrors((current) => ({ ...current, name: undefined }));
    setChecking(true);

    try {
      const [risks, conflicts, guidance, labels] = await Promise.all([
        getFoodRiskCodes(drug.id),
        checkDrugDrug(drug.id),
        getMealGuidance(drug.id),
        getFoodCategoryLabels(),
      ]);

      setFoodRiskCodes(risks);
      setDrugConflicts(conflicts);
      setMealGuidance(guidance);
      setFoodLabels(labels);
    } finally {
      setChecking(false);
    }
  }

  /** ผู้ใช้แก้ชื่อเองหลังเคยเลือกไว้ ข้อมูลที่ผูกกับยาตัวเดิมใช้ไม่ได้แล้ว */
  function handleClearDrug() {
    setDrugId(null);
    setDrugCategoryTh(null);
    setFoodRiskCodes([]);
    setDrugConflicts(null);
    setMealGuidance(null);
  }

  function toggleTime(time: string) {
    setReminderTimes((current) =>
      current.includes(time)
        ? current.filter((item) => item !== time)
        : [...current, time].sort((a, b) => a.localeCompare(b))
    );
    setErrors((current) => ({ ...current, reminderTimes: undefined }));
  }

  /** ใส่ ":" ให้อัตโนมัติระหว่างพิมพ์ เพื่อให้ได้รูปแบบ HH:MM เสมอ */
  function handleCustomTimeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setCustomTime(digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`);
    setCustomTimeError(null);
  }

  function addCustomTime() {
    if (!isValidTime(customTime)) {
      setCustomTimeError("ใช้รูปแบบ ชั่วโมง:นาที เช่น 21:30");
      return;
    }

    const time = normalizeTime(customTime);

    if (reminderTimes.includes(time)) {
      setCustomTimeError(`เลือก ${time} ไว้แล้ว`);
      return;
    }

    setReminderTimes((current) => [...current, time].sort((a, b) => a.localeCompare(b)));
    setCustomTime("");
    setShowCustomTime(false);
    setErrors((current) => ({ ...current, reminderTimes: undefined }));
  }

  function scrollToField(key: FieldKey) {
    scrollRef.current?.scrollTo({ y: Math.max(0, fieldY.current[key] - 12), animated: true });
  }

  async function handleSave() {
    const input = { name, dosage, quantity, reminderTimes, note };
    const medications = await getMedications();
    const validationErrors = validateMedication(input, medications, medicationId);

    setErrors(validationErrors);
    setTriedSave(true);

    if (hasErrors(validationErrors)) {
      scrollToField(validationErrors.name ? "name" : validationErrors.dosage || validationErrors.quantity ? "amount" : "times");
      return;
    }

    setSaving(true);

    try {
      const normalizedTimes = reminderTimes.map(normalizeTime).sort((a, b) => a.localeCompare(b));
      const timestamp = new Date().toISOString();
      const granted = isActive ? await requestNotificationPermission() : false;

      if (isEditing && medicationId) {
        const existing = await getMedicationById(medicationId);

        if (!existing) {
          showMessage("ไม่พบข้อมูล", "ยานี้อาจถูกลบจากอีกเครื่องของคุณ");
          return;
        }

        // อัปเดตเวลาที่ตารางเริ่มมีผลเฉพาะตอนที่เวลาเปลี่ยนจริง
        // เพื่อไม่ให้ระบบสร้างประวัติย้อนหลังของเวลาที่เพิ่งเพิ่มเข้ามา
        const timesChanged =
          existing.reminderTimes.length !== normalizedTimes.length ||
          existing.reminderTimes.some((time, index) => time !== normalizedTimes[index]);

        const updated: Medication = {
          ...existing,
          drugId,
          foodRiskCodes,
          mealRelation,
          name: name.trim(),
          dosage: dosage.trim(),
          quantity: Number(quantity),
          reminderTimes: normalizedTimes,
          note: note.trim(),
          status: isActive ? "active" : "paused",
          remindersUpdatedAt: timesChanged ? timestamp : existing.remindersUpdatedAt ?? existing.createdAt,
          updatedAt: timestamp,
        };

        let notificationIds: string[] = [];

        if (isActive && granted) {
          notificationIds = await rescheduleMedicationReminders(updated, existing.notificationIds);
        } else {
          await cancelMedicationReminders(existing.notificationIds);
        }

        await updateMedication({ ...updated, notificationIds });
        // ข้ามเมื่อยังไม่มีผลตรวจ ไม่งั้นจะไปลบคำเตือนเดิมทิ้งทั้งที่ยังไม่รู้ผลจริง
        if (drugConflicts !== null) {
          await recordDrugDrugAlerts(updated.id, updated.name, drugConflicts);
        }
      } else {
        const medication: Medication = {
          // ต้องเป็น uuid จริง เพราะคอลัมน์ id ในฐานข้อมูลเป็นชนิด uuid
          id: randomUUID(),
          drugId,
          name: name.trim(),
          dosage: dosage.trim(),
          quantity: Number(quantity),
          reminderTimes: normalizedTimes,
          mealRelation,
          foodRiskCodes,
          note: note.trim(),
          status: "active",
          notificationIds: [],
          createdAt: timestamp,
          remindersUpdatedAt: timestamp,
          updatedAt: timestamp,
        };

        const notificationIds = granted ? await scheduleMedicationReminders(medication) : [];

        await addMedication({ ...medication, notificationIds });
        // เก็บคำเตือนไว้ดูย้อนหลัง ต้องทำหลังบันทึกยาเพราะอ้าง medication_id
        if (drugConflicts !== null) {
          await recordDrugDrugAlerts(medication.id, medication.name, drugConflicts);
        }
      }

      if (isActive && !granted && Platform.OS !== "web") {
        showMessage(
          "บันทึกแล้ว แต่ยังไม่มีเสียงเตือน",
          "แอปยังไม่ได้รับสิทธิ์แจ้งเตือน ยาอยู่ในตารางแล้ว แต่จะไม่เตือนเมื่อถึงเวลา เปิดสิทธิ์ได้ที่หน้าตั้งค่า"
        );
      }

      closeNested(returnTo, "/medications");
    } finally {
      setSaving(false);
    }
  }

  const quantityNumber = Number(quantity);
  const filled = [
    name.trim().length > 0,
    dosage.trim().length > 0,
    quantity.trim().length > 0 && quantityNumber >= 1 && quantityNumber <= 999,
    reminderTimes.length > 0,
  ].filter(Boolean).length;

  const missing: { key: FieldKey; label: string }[] = [
    errors.name ? { key: "name" as const, label: "ชื่อยา" } : null,
    errors.dosage ? { key: "amount" as const, label: "ขนาดต่อครั้ง" } : null,
    errors.quantity ? { key: "amount" as const, label: "จำนวนคงเหลือ" } : null,
    errors.reminderTimes ? { key: "times" as const, label: "เวลาอย่างน้อย 1 เวลา" } : null,
  ].filter((item): item is { key: FieldKey; label: string } => item !== null);

  const comparedCount = otherMedications.filter((item) => item.status === "active" && item.drugId).length;
  const allTimes = Array.from(new Set([...PRESET_TIMES, ...reminderTimes])).sort((a, b) => a.localeCompare(b));
  const riskFoods = foodRiskCodes.map((code) => ({ code, label: foodLabels[code] ?? code }));

  return (
    <View style={styles.screen}>
      <FormTopBar title={isEditing ? "แก้ไขข้อมูลยา" : "เพิ่มยาใหม่"} onClose={() => closeNested(returnTo, "/medications")} />

      <View style={styles.progress}>
        <ProgressBar segments={[{ value: filled, color: colors.primary }]} total={REQUIRED_FIELDS} height={8} />
        <AppText variant="meta" weight="regular" color={colors.textMuted}>
          {`กรอกแล้ว ${filled} จาก ${REQUIRED_FIELDS} ช่องที่จำเป็น`}
        </AppText>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {triedSave && missing.length > 0 ? (
            <View style={styles.missingBox} accessibilityLiveRegion="polite">
              <AppText variant="label" weight="bold" color={colors.dangerDeep}>
                {`ยังขาด ${missing.length} ช่อง`}
              </AppText>
              {missing.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => scrollToField(item.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`ไปแก้ ${item.label}`}
                  style={styles.missingRow}
                >
                  <AppText variant="small">{item.label}</AppText>
                  <AppText variant="small" weight="bold" color={colors.primaryText}>
                    ไปแก้ ›
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View onLayout={(event) => (fieldY.current.name = event.nativeEvent.layout.y)} style={styles.group}>
            <DrugSearchInput
              value={name}
              onChangeText={setName}
              onSelectDrug={handleSelectDrug}
              onClearSelection={handleClearDrug}
              selectedDrugId={drugId}
              selectedCategoryTh={drugCategoryTh}
              error={errors.name}
            />

            {drugId ? (
              checking ? (
                <InteractionNotice state="checking" />
              ) : drugConflicts === null ? (
                <InteractionNotice state="unchecked" reason="ติดต่อฐานข้อมูลไม่ได้ ยังบันทึกได้ ระบบจะตรวจให้อีกครั้งตอนเปิดแก้ไขขณะออนไลน์" />
              ) : drugConflicts.length === 0 ? (
                <InteractionNotice state="none" compared={comparedCount} subject="ยาตีกัน" />
              ) : (
                <InteractionNotice
                  state="found"
                  context="กับยาที่กินอยู่"
                  items={drugConflicts.map((conflict) => ({
                    severity: conflict.severity,
                    title: `${name.trim()} + ${conflict.otherName}`,
                    body: conflict.mechanismTh,
                  }))}
                  footer="บันทึกยานี้ต่อได้ แต่ถามเภสัชกรหรือแพทย์ก่อนเริ่มกินคู่กัน"
                />
              )
            ) : null}
          </View>

          <View onLayout={(event) => (fieldY.current.amount = event.nativeEvent.layout.y)} style={styles.row}>
            <TextField
              label="ขนาดต่อครั้ง"
              required
              value={dosage}
              onChangeText={setDosage}
              placeholder="เช่น 500 มก."
              error={errors.dosage}
              style={styles.flex}
            />
            <View style={styles.flex}>
              <Stepper label="คงเหลือ" required value={quantity} onChange={setQuantity} min={0} max={999} error={errors.quantity} />
            </View>
          </View>

          <View onLayout={(event) => (fieldY.current.times = event.nativeEvent.layout.y)} style={styles.group}>
            <AppText variant="label" color={colors.textSoft}>
              เวลาที่ต้องกิน
              <AppText variant="label" color={colors.danger}> *</AppText>
            </AppText>
            <View style={styles.chips}>
              {allTimes.map((time) => (
                <Chip
                  key={time}
                  label={time}
                  check
                  selected={reminderTimes.includes(time)}
                  onPress={() => toggleTime(time)}
                  accessibilityLabel={`เวลา ${time}${reminderTimes.includes(time) ? " เลือกอยู่ แตะเพื่อเอาออก" : ""}`}
                />
              ))}
              <Pressable
                onPress={() => setShowCustomTime((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel="เพิ่มเวลาอื่น"
                style={({ pressed }) => [styles.addTime, pressed && styles.pressed]}
              >
                <AppText variant="label" color={colors.primaryText}>
                  + เวลาอื่น
                </AppText>
              </Pressable>
            </View>
            {showCustomTime ? (
              <View style={styles.customRow}>
                <TextField
                  value={customTime}
                  onChangeText={handleCustomTimeChange}
                  placeholder="21:30"
                  keyboardType="number-pad"
                  maxLength={5}
                  error={customTimeError}
                  style={styles.flex}
                  autoFocus
                  onSubmitEditing={addCustomTime}
                  accessibilityLabel="เวลาอื่น รูปแบบ ชั่วโมง:นาที"
                />
                <Button label="เพิ่ม" variant="tint" size="md" onPress={addCustomTime} style={styles.customAdd} />
              </View>
            ) : null}
            {errors.reminderTimes ? (
              <AppText variant="meta" weight="semibold" color={colors.dangerText}>
                {`✕ ${errors.reminderTimes}`}
              </AppText>
            ) : null}
          </View>

          <View style={styles.group}>
            <AppText variant="label" color={colors.textSoft}>
              เทียบมื้ออาหาร
            </AppText>
            <View style={styles.relationGrid}>
              {MEAL_RELATIONS.map((value) => {
                const selected = value === mealRelation;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setMealRelation(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.relation, selected && styles.relationSelected]}
                  >
                    <View style={styles.relationInner}>
                      {selected ? <MaterialCommunityIcons name="check-bold" size={15} color={colors.primaryText} /> : null}
                      <AppText
                        variant="label"
                        weight={selected ? "bold" : "regular"}
                        color={selected ? colors.primaryText : colors.textSoft}
                        align="center"
                      >
                        {mealRelationLabel[value]}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {/* คำแนะนำจากฐานข้อมูล ไม่เลือกให้อัตโนมัติ เพราะผู้ใช้ควรทำตามที่แพทย์หรือเภสัชกรสั่ง */}
            {mealGuidance ? (
              <View style={styles.guidance}>
                <AppText variant="small" color={colors.onHeroText}>
                  {`คำแนะนำจากฐานข้อมูล: ${mealGuidance}`}
                </AppText>
              </View>
            ) : null}
          </View>

          {drugId && riskFoods.length > 0 ? (
            <View style={styles.foodBox}>
              <View style={styles.foodTitle}>
                <SeverityBars level="moderate" color={colors.warnText} />
                <AppText variant="label" weight="bold" color={colors.warnText}>
                  อาหารที่ควรระวังกับยานี้
                </AppText>
              </View>
              <View style={styles.chips}>
                {riskFoods.map((food) => (
                  <View key={food.code} style={styles.foodChip}>
                    <MaterialCommunityIcons name={foodIcon(food.code).icon} size={16} color={foodIcon(food.code).color} />
                    <AppText variant="small" weight="semibold" color={colors.warnText}>
                      {food.label}
                    </AppText>
                  </View>
                ))}
              </View>
              <AppText variant="meta" weight="regular" color={colors.textSoft}>
                จะเตือนอีกครั้งตอนบันทึกมื้อที่มีอาหารกลุ่มนี้
              </AppText>
            </View>
          ) : null}

          <TextField
            label="บันทึกของฉัน (ไม่บังคับ)"
            value={note}
            onChangeText={setNote}
            placeholder="เช่น หมอนัดเจาะเลือดทุกเดือน"
            multiline
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Button label="ยกเลิก" variant="plain" onPress={() => closeNested(returnTo, "/medications")} style={styles.cancel} />
        <Button label="บันทึกยา" loadingLabel="กำลังบันทึก…" loading={saving} onPress={handleSave} style={styles.flex} />
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
  progress: {
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 16,
  },
  missingBox: {
    backgroundColor: colors.dangerTint,
    borderRadius: radius.field,
    padding: 12,
    gap: 7,
  },
  missingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    minHeight: 44,
  },
  group: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  addTime: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#97B5CF",
    backgroundColor: colors.tertiary,
  },
  pressed: {
    opacity: 0.7,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  customAdd: {
    width: 88,
    marginTop: 2,
  },
  relationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  relation: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 2,
    borderColor: "transparent",
    paddingHorizontal: 10,
  },
  relationInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  relationSelected: {
    borderColor: colors.primary,
  },
  guidance: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.small,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  foodBox: {
    backgroundColor: colors.warnSurface,
    borderRadius: 18,
    padding: 14,
    gap: 9,
  },
  foodTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
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
  bottomBar: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancel: {
    width: 100,
  },
});
