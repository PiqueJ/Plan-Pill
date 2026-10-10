import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ComponentProps, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { foodIcon } from "../constants/foodIcons";
import { mealStyle } from "../constants/mealStyle";
import { colors, radius, severityMeta } from "../constants/theme";
import { parseAlert } from "../services/alerts";
import { InteractionDetail, getDrugInteractionDetail, getFoodInteractionDetail } from "../services/drugs";
import { formatTime, formatWeekdayShort, isSameDay, startOfDay } from "../services/schedule";
import { InteractionAlert, Meal, Medication, SeverityLevel, mealTypeLabel } from "../types";
import AppText from "./ui/AppText";
import { EmptyCard } from "./ui/Card";
import SeverityBars from "./ui/SeverityBars";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const LEVELS: SeverityLevel[] = ["major", "moderate", "minor"];

/** สีของแต่ละระดับบนพื้นขาว (แถบ ตัวอักษร และพื้นช่องสรุป) */
const LEVEL_LOOK: Record<SeverityLevel, { bar: string; text: string; tint: string }> = {
  major: { bar: colors.danger, text: colors.dangerText, tint: colors.dangerTint },
  moderate: { bar: colors.warn, text: colors.warnText, tint: colors.warnTint },
  minor: { bar: colors.textMuted, text: colors.textSoft, tint: colors.neutralTint },
};

/**
 * คำอธิบายสำรองเมื่อฐานข้อมูลไม่มีข้อความของคู่นั้น (คู่ยา-ยาของ DDInter มีแค่ระดับความรุนแรง)
 * แปลความหมายของแต่ละระดับตามนิยามของ DDInter ดีกว่าบอกแค่ว่า "ไม่มีข้อมูล"
 */
const LEVEL_FALLBACK: Record<SeverityLevel, { mechanism: string; management: string }> = {
  major: {
    mechanism: "DDInter จัดคู่นี้เป็นระดับอันตราย คือมีผลต่อร่างกายชัดเจน ความเสี่ยงมักมากกว่าประโยชน์ (ฐานข้อมูลไม่ได้ระบุกลไกของคู่นี้)",
    management: "อย่าเริ่มกินคู่กันเอง ถามแพทย์หรือเภสัชกรก่อน และอย่าหยุดยาเดิมเอง",
  },
  moderate: {
    mechanism: "DDInter จัดคู่นี้เป็นระดับควรระวัง คือมีผลต่อร่างกายปานกลาง ใช้คู่กันได้เมื่อแพทย์เห็นว่าจำเป็นและคอยติดตามอาการ (ฐานข้อมูลไม่ได้ระบุกลไกของคู่นี้)",
    management: "บอกแพทย์หรือเภสัชกรว่ากินคู่กันอยู่ แล้วสังเกตอาการผิดปกติ อย่าหยุดยาเอง",
  },
  minor: {
    mechanism: "DDInter จัดคู่นี้เป็นระดับเล็กน้อย คือผลต่อร่างกายน้อย ส่วนใหญ่ไม่ต้องเปลี่ยนยา (ฐานข้อมูลไม่ได้ระบุกลไกของคู่นี้)",
    management: "แจ้งเภสัชกรไว้ตอนรับยาครั้งหน้า ส่วนใหญ่ไม่ต้องเปลี่ยนอะไร",
  },
};

/**
 * "เหตุการณ์" 1 ครั้งที่ทำให้เกิดคำเตือน = มื้ออาหาร 1 มื้อ หรือการเพิ่มยา 1 ครั้ง
 *
 * มื้อเดียวอาจตีกับยาหลายตัว (หมูกระทะกับเบียร์ ตีกับยา 6 ตัว) ถ้าแสดงทีละคำเตือน
 * ผู้ใช้จะเห็นการ์ดซ้ำ ๆ 6 ใบจากมื้อเดียว จึงรวมเป็นการ์ดเดียวต่อเหตุการณ์
 */
export type AlertEvent = {
  key: string;
  mealId: string | null;
  medicationId: string | null;
  time: string;
  items: InteractionAlert[];
  top: SeverityLevel;
};

export function groupAlertEvents(alerts: InteractionAlert[]): AlertEvent[] {
  const events = new Map<string, AlertEvent>();

  for (const alert of alerts) {
    const key = alert.mealId ? `meal:${alert.mealId}` : alert.medicationId ? `med:${alert.medicationId}` : `alert:${alert.id}`;
    const existing = events.get(key);

    if (existing) {
      existing.items.push(alert);
      if (alert.createdAt < existing.time) existing.time = alert.createdAt;
      if (severityMeta[alert.severity].rank > severityMeta[existing.top].rank) existing.top = alert.severity;
    } else {
      events.set(key, {
        key,
        mealId: alert.mealId,
        medicationId: alert.medicationId,
        time: alert.createdAt,
        items: [alert],
        top: alert.severity,
      });
    }
  }

  for (const event of events.values()) {
    event.items.sort((a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank);
  }

  return [...events.values()].sort((a, b) => b.time.localeCompare(a.time));
}

/** ต้นเหตุของคำเตือน: หมวดอาหาร (ยา-อาหาร) หรือยาที่เพิ่มเข้ามา (ยา-ยา) */
function triggerOf(alert: InteractionAlert) {
  const parsed = parseAlert(alert);
  return alert.kind === "drug_food"
    ? { key: `food:${parsed.other}`, label: parsed.other, kind: "food" as const }
    : { key: `drug:${parsed.drug}`, label: parsed.drug, kind: "drug" as const };
}

type AlertHistoryProps = {
  /** คำเตือนที่อยู่ในช่วงที่เลือกแล้ว (สัปดาห์ หรือวันเดียว) */
  alerts: InteractionAlert[];
  meals: Meal[];
  medications: Medication[];
  /** ชื่อหมวดอาหารภาษาไทย → code ใช้หาไอคอนของหมวด */
  foodCodeByLabel: Record<string, string>;
  /** "สัปดาห์นี้" "สัปดาห์ 14 – 20 ก.ย." หรือ "วันอังคาร 22 ก.ย." */
  scopeLabel: string;
  /** มีเมื่อกำลังดูวันเดียว ให้กดกลับไปดูทั้งสัปดาห์ได้ (ไม่ต้องเดาว่าต้องแตะวันเดิมซ้ำ) */
  onShowWeek?: () => void;
  onOpenMeal: (mealId: string) => void;
  onOpenMedication: (medicationId: string) => void;
};

/**
 * ประวัติคำเตือน (หน้า 09b) ออกแบบให้ตอบ 3 คำถามตามลำดับ
 *
 *   1. ช่วงนี้เจออะไรบ้าง รุนแรงแค่ไหน      → ช่องสรุป 3 ระดับ แตะเพื่อกรอง
 *   2. อะไรเป็นต้นเหตุบ่อยที่สุด             → ชิปต้นเหตุ เช่น แอลกอฮอล์ 2 มื้อ แตะเพื่อกรอง
 *   3. เกิดอะไรขึ้น และควรทำอย่างไร         → แตะคู่ยาในการ์ด ดึงคำอธิบายจากฐานข้อมูลมาให้อ่าน
 *
 * คำเตือนจากมื้อเดียวกันหรือการเพิ่มยาครั้งเดียวกันรวมอยู่ในการ์ดเดียว
 */
export default function AlertHistory({
  alerts,
  meals,
  medications,
  foodCodeByLabel,
  scopeLabel,
  onShowWeek,
  onOpenMeal,
  onOpenMedication,
}: AlertHistoryProps) {
  const [severity, setSeverity] = useState<SeverityLevel | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);

  const allEvents = groupAlertEvents(alerts);
  const levelCount = (level: SeverityLevel) => alerts.filter((alert) => alert.severity === level).length;

  // นับต้นเหตุเป็น "จำนวนครั้ง" ไม่ใช่จำนวนคำเตือน มื้อเดียวที่มีเบียร์นับเป็น 1 ครั้ง
  const triggerCounts = new Map<
    string,
    { key: string; label: string; kind: "food" | "drug"; count: number; rank: number }
  >();

  for (const event of allEvents) {
    const seen = new Set<string>();
    for (const alert of event.items) {
      const found = triggerOf(alert);
      const current = triggerCounts.get(found.key);
      const rank = Math.max(current?.rank ?? 0, severityMeta[alert.severity].rank);
      const count = (current?.count ?? 0) + (seen.has(found.key) ? 0 : 1);
      seen.add(found.key);
      triggerCounts.set(found.key, { ...found, count, rank });
    }
  }

  // เจอบ่อยขึ้นก่อน ถ้าเท่ากันเอาตัวที่ทำให้เกิดคำเตือนรุนแรงกว่าขึ้นก่อน
  const topTriggers = [...triggerCounts.values()]
    .sort((a, b) => b.count - a.count || b.rank - a.rank)
    .slice(0, 4);
  const topFood = topTriggers.find((item) => item.kind === "food" && item.count >= 2);

  const visible = allEvents
    .map((event) => ({
      ...event,
      items: event.items.filter(
        (alert) => (!severity || alert.severity === severity) && (!trigger || triggerOf(alert).key === trigger)
      ),
    }))
    .filter((event) => event.items.length > 0);

  const days: { day: Date; events: AlertEvent[] }[] = [];

  for (const event of visible) {
    const day = startOfDay(new Date(event.time));
    const bucket = days.find((item) => isSameDay(item.day, day));

    if (bucket) {
      bucket.events.push(event);
    } else {
      days.push({ day, events: [event] });
    }
  }

  const filtering = severity !== null || trigger !== null;

  if (alerts.length === 0) {
    return (
      <EmptyCard
        title={`ไม่มีคำเตือนใน${scopeLabel}`}
        body="คำเตือนจะถูกบันทึกเมื่อเพิ่มยาหรือบันทึกมื้อที่ตีกับยาที่กินอยู่"
        actionLabel={onShowWeek ? "ดูทั้งสัปดาห์" : undefined}
        onAction={onShowWeek}
      />
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.summary}>
        <View style={styles.summaryHead}>
          <AppText variant="label" weight="bold">
            {`สรุป${scopeLabel}`}
          </AppText>
          {onShowWeek ? (
            <Pressable onPress={onShowWeek} accessibilityRole="button" hitSlop={8}>
              <AppText variant="meta" color={colors.primaryText}>
                ดูทั้งสัปดาห์
              </AppText>
            </Pressable>
          ) : (
            <AppText variant="meta" weight="regular" color={colors.textMuted}>
              {`${alerts.length} คำเตือน จาก ${allEvents.length} ครั้ง`}
            </AppText>
          )}
        </View>

        <View style={styles.levels}>
          {LEVELS.map((level) => {
            const count = levelCount(level);
            const selected = severity === level;
            const look = LEVEL_LOOK[level];

            return (
              <Pressable
                key={level}
                onPress={() => setSeverity(selected ? null : level)}
                disabled={count === 0 && !selected}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: count === 0 }}
                accessibilityLabel={`${severityMeta[level].label} ${count} คำเตือน${selected ? " กรองอยู่ แตะเพื่อยกเลิก" : " แตะเพื่อกรอง"}`}
                style={({ pressed }) => [
                  styles.level,
                  { backgroundColor: look.tint, borderColor: selected ? look.bar : "transparent", opacity: count === 0 ? 0.5 : 1 },
                  pressed && styles.pressed,
                ]}
              >
                <SeverityBars level={level} color={look.bar} />
                <AppText variant="heading" color={look.text}>
                  {count}
                </AppText>
                <AppText variant="meta" color={look.text}>
                  {severityMeta[level].label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {topTriggers.length > 0 ? (
          <View style={styles.triggers}>
            <AppText variant="meta" weight="semibold" color={colors.textMuted}>
              ต้นเหตุที่เจอบ่อย · แตะเพื่อกรอง
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.triggerRow}>
              {topTriggers.map((item) => {
                const selected = trigger === item.key;
                const icon = item.kind === "food" ? foodIcon(foodCodeByLabel[item.label] ?? "") : null;

                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setTrigger(selected ? null : item.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.label} ${item.count} ครั้ง`}
                    style={({ pressed }) => [styles.trigger, selected && styles.triggerSelected, pressed && styles.pressed]}
                  >
                    <View style={[styles.triggerIcon, { backgroundColor: selected ? "rgba(255,255,255,0.22)" : icon?.background ?? colors.primaryTint }]}>
                      <MaterialCommunityIcons
                        name={(icon?.icon ?? "pill") as IconName}
                        size={16}
                        color={selected ? colors.onPrimary : icon?.color ?? colors.primary}
                      />
                    </View>
                    <AppText variant="label" weight="semibold" color={selected ? colors.onPrimary : colors.text}>
                      {item.label}
                    </AppText>
                    <AppText variant="meta" color={selected ? colors.onPrimaryMuted : colors.textMuted}>
                      {item.kind === "food" ? `${item.count} มื้อ` : "ยาใหม่"}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
            {topFood ? (
              <AppText variant="meta" weight="regular" color={colors.textSoft}>
                {`${topFood.label} ทำให้เกิดคำเตือนบ่อยที่สุด (${topFood.count} มื้อ) · ถามเภสัชกรว่าควรเลี่ยงช่วงไหน`}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>

      {filtering ? (
        <View style={styles.filterBar}>
          <MaterialCommunityIcons name="filter-variant" size={18} color={colors.primaryText} />
          <AppText variant="small" color={colors.textSoft} style={styles.flex}>
            {`แสดงเฉพาะ ${[severity ? severityMeta[severity].label : null, trigger ? triggerCounts.get(trigger)?.label : null]
              .filter(Boolean)
              .join(" · ")}`}
          </AppText>
          <Pressable
            onPress={() => {
              setSeverity(null);
              setTrigger(null);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <AppText variant="label" color={colors.primaryText}>
              ล้างตัวกรอง
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {filtering && days.length === 0 ? (
        <EmptyCard
          title="ไม่มีคำเตือนที่ตรงกับตัวกรอง"
          actionLabel="ล้างตัวกรอง"
          onAction={() => {
            setSeverity(null);
            setTrigger(null);
          }}
        />
      ) : null}

      {days.map((bucket) => (
        <View key={bucket.day.toISOString()} style={styles.day}>
          <View style={styles.dayHead}>
            <AppText variant="label" weight="bold" accessibilityRole="header">
              {formatWeekdayShort(bucket.day)}
            </AppText>
            <AppText variant="meta" weight="regular" color={colors.textMuted}>
              {`${bucket.events.length} ครั้ง`}
            </AppText>
          </View>
          {bucket.events.map((event) => (
            <EventCard
              key={event.key}
              event={event}
              meal={meals.find((item) => item.id === event.mealId) ?? null}
              medication={medications.find((item) => item.id === event.medicationId) ?? null}
              foodCodeByLabel={foodCodeByLabel}
              onOpenMeal={onOpenMeal}
              onOpenMedication={onOpenMedication}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

type DetailState = InteractionDetail | "loading" | "missing";

function EventCard({
  event,
  meal,
  medication,
  foodCodeByLabel,
  onOpenMeal,
  onOpenMedication,
}: {
  event: AlertEvent;
  meal: Meal | null;
  medication: Medication | null;
  foodCodeByLabel: Record<string, string>;
  onOpenMeal: (mealId: string) => void;
  onOpenMedication: (medicationId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailState>>({});

  const first = parseAlert(event.items[0]);
  const isMeal = event.mealId !== null;
  const style = meal ? mealStyle(meal.mealType) : null;
  const top = severityMeta[event.top];
  const topLook = LEVEL_LOOK[event.top];

  const title = isMeal ? meal?.name ?? first.mealName ?? "มื้ออาหาร" : `เพิ่มยา ${medication?.name ?? first.drug}`;
  const subtitle = isMeal
    ? `${meal ? mealTypeLabel[meal.mealType] : "มื้ออาหาร"} · ${formatTime(meal?.eatenAt ?? event.time)}`
    : `ตรวจตอนเพิ่มยา · ${formatTime(event.time)}`;

  async function toggle(alert: InteractionAlert) {
    if (openId === alert.id) {
      setOpenId(null);
      return;
    }

    setOpenId(alert.id);

    if (details[alert.id] && details[alert.id] !== "missing") {
      return;
    }

    setDetails((current) => ({ ...current, [alert.id]: "loading" }));
    const parsed = parseAlert(alert);
    const found =
      alert.kind === "drug_food"
        ? await getFoodInteractionDetail(parsed.drug, parsed.other)
        : await getDrugInteractionDetail(parsed.drug, parsed.other);

    setDetails((current) => ({ ...current, [alert.id]: found ?? "missing" }));
  }

  return (
    <View style={[styles.card, event.top === "major" && styles.cardMajor]}>
      <View style={styles.cardHead}>
        <View style={[styles.eventIcon, { backgroundColor: style?.background ?? colors.primaryTint }]}>
          <MaterialCommunityIcons
            name={(style?.icon ?? (isMeal ? "silverware-fork-knife" : "pill")) as IconName}
            size={22}
            color={style?.color ?? colors.primary}
          />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" weight="bold" numberOfLines={2}>
            {title}
          </AppText>
          <AppText variant="meta" weight="regular" color={colors.textMuted}>
            {subtitle}
          </AppText>
        </View>
        <View style={[styles.topPill, { backgroundColor: event.top === "major" ? colors.danger : topLook.tint }]}>
          <SeverityBars level={event.top} color={event.top === "major" ? colors.onPrimary : topLook.bar} />
          <AppText variant="tiny" weight="bold" color={event.top === "major" ? colors.onPrimary : topLook.text}>
            {top.label}
          </AppText>
        </View>
      </View>

      {event.items.map((alert) => {
        const parsed = parseAlert(alert);
        const look = LEVEL_LOOK[alert.severity];
        const open = openId === alert.id;
        const detail = details[alert.id];
        const icon = alert.kind === "drug_food" ? foodIcon(foodCodeByLabel[parsed.other] ?? "") : null;

        return (
          <View key={alert.id} style={styles.item}>
            <Pressable
              onPress={() => toggle(alert)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${severityMeta[alert.severity].label} ${parsed.drug} กับ ${parsed.other} แตะเพื่อ${open ? "ซ่อน" : "ดู"}คำแนะนำ`}
              style={({ pressed }) => [styles.itemRow, pressed && styles.itemPressed]}
            >
              <SeverityBars level={alert.severity} color={look.bar} />
              {/* ยาและตัวที่ตีกันเป็นก้อนละชิ้น ขึ้นบรรทัดใหม่ทั้งก้อน ไอคอนจะได้ไม่ค้างอยู่คนละบรรทัดกับชื่อ */}
              <View style={styles.pair}>
                <View style={styles.pairPart}>
                  <AppText variant="label" weight="bold" style={styles.pairText}>
                    {parsed.drug}
                  </AppText>
                  <MaterialCommunityIcons name="plus" size={14} color={colors.textMuted} />
                </View>
                <View style={styles.pairPart}>
                  {icon ? <MaterialCommunityIcons name={icon.icon} size={16} color={icon.color} /> : null}
                  <AppText variant="label" weight="bold" style={styles.pairText}>
                    {parsed.other}
                  </AppText>
                </View>
              </View>
              <AppText variant="meta" weight="bold" color={look.text}>
                {severityMeta[alert.severity].label}
              </AppText>
              <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.placeholder} />
            </Pressable>

            {open ? (
              <View style={[styles.detail, { backgroundColor: look.tint }]}>
                {detail === "loading" || detail === undefined ? (
                  <View style={styles.detailLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <AppText variant="small" color={colors.textSoft}>
                      กำลังดึงคำอธิบาย…
                    </AppText>
                  </View>
                ) : detail === "missing" ? (
                  <AppText variant="small" color={colors.textSoft}>
                    ดึงคำอธิบายไม่ได้ตอนนี้ อาจออฟไลน์อยู่ · ถามเภสัชกรเรื่องคู่นี้ได้เลย
                  </AppText>
                ) : (
                  <>
                    <DetailBlock
                      label="เกิดอะไรขึ้น"
                      text={detail.mechanism?.trim() || LEVEL_FALLBACK[alert.severity].mechanism}
                    />
                    <DetailBlock
                      label="ควรทำอย่างไร"
                      text={detail.management?.trim() || LEVEL_FALLBACK[alert.severity].management}
                    />
                  </>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      {(isMeal && meal) || (!isMeal && medication) ? (
        <Pressable
          onPress={() => (isMeal && meal ? onOpenMeal(meal.id) : medication ? onOpenMedication(medication.id) : undefined)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.openLink, pressed && styles.pressed]}
        >
          <AppText variant="label" color={colors.primaryText}>
            {isMeal ? "ดูมื้อนี้" : "ดูยานี้"}
          </AppText>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primaryText} />
        </Pressable>
      ) : null}
    </View>
  );
}

function DetailBlock({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.detailBlock}>
      <AppText variant="meta" weight="bold" color={colors.textSoft}>
        {label}
      </AppText>
      <AppText variant="small" color={colors.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.8,
  },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
  },
  summaryHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  levels: {
    flexDirection: "row",
    gap: 8,
  },
  level: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
    borderRadius: radius.tile,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  triggers: {
    gap: 8,
  },
  triggerRow: {
    gap: 7,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 5,
    paddingRight: 12,
  },
  triggerSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  triggerIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  day: {
    gap: 8,
  },
  dayHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  cardMajor: {
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  eventIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  item: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  itemPressed: {
    backgroundColor: colors.tertiary,
  },
  pair: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 5,
  },
  pairPart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
  },
  pairText: {
    flexShrink: 1,
  },
  detail: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  detailLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailBlock: {
    gap: 2,
  },
  openLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
