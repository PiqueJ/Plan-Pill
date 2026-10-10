import { randomUUID } from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MealPhotoField from "../components/MealPhotoField";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Chip from "../components/ui/Chip";
import Hatch from "../components/ui/Hatch";
import { FormTopBar } from "../components/ui/Headers";
import InteractionNotice, { severitySummary } from "../components/ui/InteractionNotice";
import SearchField from "../components/ui/SearchField";
import Segmented from "../components/ui/Segmented";
import SeverityBars from "../components/ui/SeverityBars";
import TextField from "../components/ui/TextField";
import { foodIcon } from "../constants/foodIcons";
import { colors, radius, severityMeta, shadow } from "../constants/theme";
import { recordMealAlerts } from "../services/alerts";
import { confirmAction, showMessage } from "../services/dialog";
import { checkMealInteractions, getSelectableFoodCategories } from "../services/drugs";
import { addMeal, deleteMeal, getMealById, getMeals, updateMeal } from "../services/meals";
import { closeNested, parseReturnTo } from "../services/navigation";
import { PickedPhoto, deleteMealPhoto, getMealPhotoUrl, uploadMealPhoto } from "../services/photos";
import { formatDayMonth, isSameDay } from "../services/schedule";
import { getMedications } from "../services/storage";
import { MealErrors, hasErrors, isValidTime, normalizeTime, validateMeal } from "../services/validation";
import { FoodCategory, Meal, MealInteractionResult, MealType } from "../types";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "เช้า" },
  { value: "lunch", label: "กลางวัน" },
  { value: "dinner", label: "เย็น" },
  { value: "snack", label: "ว่าง" },
];

/** แสดงชิปหมวดอาหารกี่อันก่อนกด "อีก N หมวด" ไม่ให้หน้ายาวจนหาปุ่มบันทึกไม่เจอ */
const COLLAPSED_CHIPS = 8;

/** เดามื้อจากเวลาปัจจุบัน ลดจำนวนครั้งที่ผู้ใช้ต้องกดเลือกเอง */
function guessMealType(hour: number): MealType {
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function toTimeString(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * หน้า 08 บันทึก / แก้ไขมื้ออาหาร
 *
 * ติ๊กหมวดแล้วตรวจกับยาที่กินอยู่ทันที ไม่รอตอนกดบันทึก
 * หมวดที่อาจตีกับยาเป็นสีส้มตั้งแต่ก่อนติ๊ก แต่ยังเลือกได้ตามปกติ
 * สรุปคำเตือนอยู่เหนือปุ่มบันทึกเสมอ ผู้ใช้เห็นก่อนกดทุกครั้ง
 */
export default function MealFormScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mealId?: string; returnTo?: string }>();
  const mealId = params.mealId;
  // เปิดมาจากหน้าวันนี้หรือหน้าประวัติ ปิดแล้วต้องกลับไปที่นั่น ไม่ใช่ไดอารี่
  const returnTo = parseReturnTo(params.returnTo);
  const isEditing = Boolean(mealId);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState(() => toTimeString(new Date()));
  const [editingTime, setEditingTime] = useState(false);
  const [mealType, setMealType] = useState<MealType>(() => guessMealType(new Date().getHours()));
  const [foodCodes, setFoodCodes] = useState<string[]>([]);
  const [errors, setErrors] = useState<MealErrors>({});
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  /** หมวดอาหารที่ตีกับยาที่ผู้ใช้กินอยู่ ใช้ทำชิปสีส้มล่วงหน้า */
  const [riskCodes, setRiskCodes] = useState<string[]>([]);
  const [comparedCount, setComparedCount] = useState(0);
  /**
   * null = ตรวจไม่ได้ (ออฟไลน์) ต่างจาก [] ที่แปลว่าตรวจแล้วไม่พบอะไร
   * ต้องแยกให้ชัด ไม่งั้นจะขึ้นว่า "ไม่พบ" ทั้งที่ยังไม่ได้ตรวจ
   */
  const [warnings, setWarnings] = useState<MealInteractionResult[] | null>([]);
  const [checking, setChecking] = useState(false);

  /** วันที่ของมื้อ แก้ไขมื้อเก่าต้องคงวันเดิมไว้ ไม่ย้ายมาเป็นวันนี้ */
  const [eatenDate, setEatenDate] = useState(() => new Date());

  /** รูปที่เพิ่งเลือก ยังไม่ได้อัปโหลด (อัปโหลดตอนกดบันทึกเท่านั้น) */
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  /** path ของรูปที่อัปโหลดไว้แล้ว มาจากมื้อที่กำลังแก้ไข */
  const [savedPhotoPath, setSavedPhotoPath] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  /** ผู้ใช้กดเอารูปเดิมออก ให้ลบจริงตอนกดบันทึก ไม่ใช่ตอนกดปุ่ม */
  const [photoRemoved, setPhotoRemoved] = useState(false);

  useEffect(() => {
    async function loadReference() {
      const [list, medications] = await Promise.all([getSelectableFoodCategories(), getMedications()]);
      const active = medications.filter((item) => item.status === "active");

      setCategories(list);
      setCategoriesLoaded(true);
      setRiskCodes([...new Set(active.flatMap((item) => item.foodRiskCodes))]);
      setComparedCount(active.filter((item) => item.drugId).length);
    }

    loadReference();
  }, []);

  useEffect(() => {
    async function loadMeal() {
      if (!mealId) {
        return;
      }

      const meal = await getMealById(mealId);

      if (!meal) {
        return;
      }

      const eatenAt = new Date(meal.eatenAt);

      setName(meal.name);
      setNote(meal.note);
      setMealType(meal.mealType);
      setFoodCodes(meal.foodCodes);
      setTime(toTimeString(eatenAt));
      setEatenDate(eatenAt);
      setSavedPhotoPath(meal.photoPath);

      if (meal.photoPath) {
        setSavedPhotoUrl(await getMealPhotoUrl(meal.photoPath));
      }
    }

    loadMeal();
  }, [mealId]);

  /** ตรวจปฏิกิริยาใหม่ทุกครั้งที่หมวดอาหารที่ติ๊กเปลี่ยน */
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (foodCodes.length === 0) {
        setWarnings([]);
        return;
      }

      setChecking(true);

      try {
        const results = await checkMealInteractions(foodCodes);

        // กันผลเก่ามาทับผลใหม่ เมื่อผู้ใช้ติ๊กรัวหลายหมวดติดกัน
        if (!cancelled) {
          setWarnings(results);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [foodCodes]);

  /** รวมวันที่ของมื้อเข้ากับเวลาที่ผู้ใช้กรอก ได้เป็น timestamp เดียว */
  function buildEatenAt() {
    const [hour, minute] = normalizeTime(time).split(":").map(Number);
    const result = new Date(eatenDate);

    result.setHours(hour, minute, 0, 0);

    return result.toISOString();
  }

  /** ใส่ ":" ให้อัตโนมัติระหว่างพิมพ์ */
  function handleTimeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setTime(digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`);
  }

  function toggleCategory(code: string) {
    setFoodCodes((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  async function handleSave() {
    const input = { name, time, foodCodes, note };
    const meals = await getMeals();

    // เวลายังไม่ถูกรูปแบบก็ต้องคำนวณ eatenAt ไว้ก่อน เพราะ validateMeal ใช้ตรวจข้อมูลซ้ำ
    const isTimeShaped = /^\d{1,2}:\d{2}$/.test(time.trim());
    const eatenAt = isTimeShaped ? buildEatenAt() : eatenDate.toISOString();
    const validationErrors = validateMeal(input, meals, eatenAt, mealId);

    setErrors(validationErrors);

    if (validationErrors.time) {
      setEditingTime(true);
    }

    if (hasErrors(validationErrors)) {
      return;
    }

    setSaving(true);

    try {
      // ต้องรู้ id ก่อนอัปโหลด เพราะชื่อไฟล์ในที่เก็บอ้างอิง id ของมื้อ
      const targetId = isEditing && mealId ? mealId : randomUUID();
      const { photoPath, uploadError } = await resolvePhotoPath(targetId);

      if (isEditing && mealId) {
        const existing = await getMealById(mealId);

        if (!existing) {
          showMessage("ไม่พบข้อมูล", "มื้อนี้อาจถูกลบจากอีกเครื่องของคุณ");
          return;
        }

        await updateMeal({ ...existing, eatenAt, mealType, name: name.trim(), foodCodes, photoPath, note: note.trim() });
      } else {
        const meal: Meal = {
          // ต้องเป็น uuid จริง เพราะคอลัมน์ id ในฐานข้อมูลเป็นชนิด uuid
          id: targetId,
          eatenAt,
          mealType,
          name: name.trim(),
          foodCodes,
          photoPath,
          note: note.trim(),
          createdAt: new Date().toISOString(),
        };

        await addMeal(meal);
      }

      // เก็บคำเตือนไว้ดูย้อนหลัง ต้องทำหลังบันทึกมื้อ เพราะคำเตือนอ้าง meal_id
      // ส่งไปแม้ไม่มีคำเตือน เพื่อลบของเดิมเมื่อผู้ใช้แก้จนไม่เหลือปฏิกิริยาแล้ว
      // ข้ามเมื่อตรวจไม่สำเร็จ ไม่งั้นจะลบคำเตือนเดิมทั้งที่ยังไม่รู้ผลจริง
      if (warnings !== null) {
        await recordMealAlerts(targetId, name.trim(), warnings);
      }

      // บันทึกมื้อสำเร็จแล้วค่อยบอกเรื่องรูป เพราะข้อมูลมื้อสำคัญกว่ารูป
      if (uploadError) {
        showMessage(
          "อัปโหลดรูปไม่สำเร็จ",
          `มื้อนี้บันทึกแล้ว แต่รูปยังไม่ขึ้น (${uploadError}) กดแก้ไขมื้อนี้เพื่อแนบรูปใหม่ได้`
        );
      }

      closeNested(returnTo, "/meals");
    } finally {
      setSaving(false);
    }
  }

  /**
   * จัดการรูปตอนกดบันทึก แล้วคืน path ที่จะเก็บลงฐานข้อมูล
   *
   * อัปโหลดตอนนี้ ไม่ใช่ตอนเลือกรูป เพราะถ้าผู้ใช้ปิดฟอร์มทิ้ง
   * จะเหลือไฟล์กำพร้าใน Storage ที่ไม่มีมื้อไหนอ้างถึง
   */
  async function resolvePhotoPath(targetId: string) {
    if (photo) {
      try {
        const uploaded = await uploadMealPhoto(targetId, photo);

        // รูปใหม่คนละนามสกุลกับรูปเดิม ไฟล์เดิมจะยังอยู่ ต้องลบเอง
        if (savedPhotoPath && savedPhotoPath !== uploaded) {
          await deleteMealPhoto(savedPhotoPath);
        }

        return { photoPath: uploaded, uploadError: null as string | null };
      } catch (error) {
        return {
          // อัปโหลดไม่สำเร็จก็คงรูปเดิมไว้ ดีกว่าทำให้มื้อไม่มีรูปทั้งที่เคยมี
          photoPath: savedPhotoPath,
          uploadError: error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ",
        };
      }
    }

    if (photoRemoved && savedPhotoPath) {
      await deleteMealPhoto(savedPhotoPath);
      return { photoPath: null, uploadError: null as string | null };
    }

    return { photoPath: savedPhotoPath, uploadError: null as string | null };
  }

  function handleDelete() {
    if (!mealId) {
      return;
    }

    confirmAction({
      title: "ลบมื้อนี้?",
      message: "มื้อนี้และคำเตือนของมื้อนี้จะหายจากไดอารี่",
      confirmLabel: "ลบทิ้ง",
      destructive: true,
      onConfirm: async () => {
        await deleteMeal(mealId);
        closeNested(returnTo, "/meals");
      },
    });
  }

  const term = categoryQuery.trim().toLowerCase();
  const matching = categories.filter(
    (item) => !term || item.labelTh.toLowerCase().includes(term) || item.examplesTh.toLowerCase().includes(term)
  );
  // ที่เลือกแล้วขึ้นก่อน ตามด้วยหมวดที่อาจตีกับยา แล้วค่อยหมวดอื่น
  const ordered = [...matching].sort((a, b) => {
    const rank = (item: FoodCategory) => (foodCodes.includes(item.code) ? 0 : riskCodes.includes(item.code) ? 1 : 2);
    return rank(a) - rank(b) || a.sortOrder - b.sortOrder;
  });
  const collapsed = !term && !showAllCategories && ordered.length > COLLAPSED_CHIPS;
  const shownCategories = collapsed ? ordered.slice(0, COLLAPSED_CHIPS) : ordered;
  const hiddenCount = ordered.length - shownCategories.length;

  const topWarning = warnings && warnings.length > 0
    ? [...warnings].sort((a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank)[0]
    : null;
  const previewUri = photo?.uri ?? (photoRemoved ? null : savedPhotoUrl);
  const timeValid = isValidTime(time);
  const dateLabel = isSameDay(eatenDate, new Date()) ? "" : ` · ${formatDayMonth(eatenDate)}`;

  return (
    <View style={styles.screen}>
      <FormTopBar title={isEditing ? "แก้ไขมื้ออาหาร" : "บันทึกมื้ออาหาร"} onClose={() => closeNested(returnTo, "/meals")} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Segmented options={MEAL_TYPES} value={mealType} onChange={setMealType} accessibilityLabel="มื้อ" />

          <View style={styles.row}>
            <MealPhotoField
              previewUri={previewUri}
              onPick={(picked) => {
                setPhoto(picked);
                setPhotoRemoved(false);
              }}
              onRemove={() => {
                setPhoto(null);
                setPhotoRemoved(true);
              }}
              disabled={saving}
            />
            <View style={styles.nameColumn}>
              <TextField
                label="กินอะไร"
                required
                value={name}
                onChangeText={setName}
                placeholder="เช่น ข้าวมันไก่"
                error={errors.name}
                strong
              />
              {editingTime ? (
                <TextField
                  value={time}
                  onChangeText={handleTimeChange}
                  placeholder="12:30"
                  keyboardType="number-pad"
                  maxLength={5}
                  error={errors.time}
                  helper={`เวลาที่กิน${dateLabel}`}
                  accessibilityLabel="เวลาที่กิน รูปแบบ ชั่วโมง:นาที"
                  onBlur={() => {
                    if (isValidTime(time)) {
                      setTime(normalizeTime(time));
                      setEditingTime(false);
                    }
                  }}
                />
              ) : (
                <Pressable
                  onPress={() => setEditingTime(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`เวลา ${time} แตะเพื่อเปลี่ยน`}
                  hitSlop={8}
                >
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    {`เวลา ${timeValid ? normalizeTime(time) : time}${dateLabel} · `}
                    <AppText variant="meta" weight="semibold" color={colors.primaryText}>
                      แตะเพื่อเปลี่ยน
                    </AppText>
                  </AppText>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.group}>
            <View style={styles.categoryHeader}>
              <AppText variant="label" color={colors.textSoft}>
                หมวดอาหาร
              </AppText>
              {categories.length > 0 ? (
                <AppText variant="meta" weight="bold" color={colors.primaryText}>
                  {`เลือก ${foodCodes.length}/${categories.length}`}
                </AppText>
              ) : null}
            </View>

            {!categoriesLoaded ? (
              <ActivityIndicator color={colors.primary} style={styles.loading} />
            ) : categories.length === 0 ? (
              <Hatch style={styles.hatch}>
                <AppText variant="small">
                  <AppText variant="small" weight="bold">
                    โหลดหมวดอาหารไม่ได้
                  </AppText>
                  {" · อาจออฟไลน์อยู่ ยังบันทึกมื้อได้ แต่ตรวจกับยาให้ไม่ได้"}
                </AppText>
              </Hatch>
            ) : (
              <>
                <SearchField value={categoryQuery} onChangeText={setCategoryQuery} placeholder="ค้นหาหมวด เช่น นม กาแฟ" />
                <View style={styles.chips}>
                  {shownCategories.map((item) => (
                    <Chip
                      key={item.code}
                      label={item.labelTh}
                      check
                      leading={foodIcon(item.code)}
                      selected={foodCodes.includes(item.code)}
                      warn={riskCodes.includes(item.code)}
                      onPress={() => toggleCategory(item.code)}
                      accessibilityLabel={`${item.labelTh} เช่น ${item.examplesTh}${
                        foodCodes.includes(item.code) ? " เลือกอยู่" : ""
                      }${riskCodes.includes(item.code) ? " อาจตีกับยาที่กินอยู่" : ""}`}
                    />
                  ))}
                  {collapsed ? (
                    <Chip label={`อีก ${hiddenCount} หมวด`} onPress={() => setShowAllCategories(true)} />
                  ) : null}
                </View>
                {term && matching.length === 0 ? (
                  <AppText variant="small" color={colors.textMuted}>
                    {`ไม่พบหมวด “${categoryQuery.trim()}” ลองคำอื่น เช่น นม ผัก กาแฟ`}
                  </AppText>
                ) : null}
                {riskCodes.length > 0 ? (
                  <AppText variant="meta" weight="regular" color={colors.textMuted}>
                    หมวดสีส้ม ! = อาจตีกับยาที่กินอยู่ ยังเลือกได้ตามปกติ
                  </AppText>
                ) : null}
              </>
            )}
          </View>

          {warnings && warnings.length > 0 ? (
            <InteractionNotice
              state="found"
              context="กับยาที่กินอยู่"
              items={warnings.map((warning) => ({
                severity: warning.severity,
                title: `${warning.medicationName} + ${warning.foodLabelTh}`,
                body: warning.mechanismTh ?? warning.descriptionEn,
              }))}
              footer="ยังบันทึกมื้อนี้ได้ตามปกติ ข้อมูลนี้เป็นข้อควรระวัง ไม่ใช่คำสั่งให้หยุดยา"
            />
          ) : null}

          <TextField
            label="บันทึกเพิ่มเติม (ไม่บังคับ)"
            value={note}
            onChangeText={setNote}
            placeholder="เช่น กินยาหลังมื้อนี้แล้ว"
            multiline
          />

          {isEditing ? (
            <Pressable onPress={handleDelete} accessibilityRole="button" style={styles.deleteLink} hitSlop={6}>
              <AppText variant="label" color={colors.dangerText} align="center">
                ลบมื้อนี้ออกจากไดอารี่
              </AppText>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {foodCodes.length > 0 ? (
          checking ? (
            <View style={styles.summaryRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText variant="meta" weight="semibold">
                กำลังตรวจกับยาที่กินอยู่…
              </AppText>
            </View>
          ) : warnings === null ? (
            <Hatch style={styles.summaryHatch}>
              <AppText variant="meta" weight="bold">
                ? ยังไม่ได้ตรวจ · ไม่ได้แปลว่าปลอดภัย
              </AppText>
            </Hatch>
          ) : topWarning ? (
            <View
              style={[
                styles.summary,
                { backgroundColor: topWarning.severity === "major" ? colors.dangerTint : topWarning.severity === "moderate" ? colors.warnSurface : colors.neutralTint },
              ]}
            >
              <SeverityBars
                level={topWarning.severity}
                color={topWarning.severity === "major" ? colors.danger : severityMeta[topWarning.severity].color}
              />
              <AppText
                variant="meta"
                weight="regular"
                color={topWarning.severity === "major" ? colors.dangerDeep : colors.textSoft}
                style={styles.flex}
              >
                <AppText
                  variant="meta"
                  weight="bold"
                  color={topWarning.severity === "major" ? colors.dangerDeep : severityMeta[topWarning.severity].color}
                >
                  {`ตีกับยา ${warnings?.length ?? 0} รายการ (${severitySummary((warnings ?? []).map((item) => item.severity))})`}
                </AppText>
                {` · รุนแรงสุด ${topWarning.medicationName} กับ ${topWarning.foodLabelTh} · บันทึกได้ แล้วค่อยถามเภสัชกร`}
              </AppText>
            </View>
          ) : (
            <InteractionNotice state="none" compared={comparedCount} />
          )
        ) : null}

        <Button label="บันทึกมื้อนี้" loadingLabel="กำลังบันทึก…" loading={saving} onPress={handleSave} />
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  group: {
    gap: 9,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  loading: {
    alignSelf: "flex-start",
    marginVertical: 8,
  },
  hatch: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  deleteLink: {
    minHeight: 44,
    justifyContent: "center",
  },
  bottom: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    ...shadow.bar,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  summaryHatch: {
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 14,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
});
