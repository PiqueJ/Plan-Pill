import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SeverityLevel } from "../../types";
import { colors, radius, severityMeta } from "../../constants/theme";
import AppText from "./AppText";
import Hatch from "./Hatch";
import SeverityBars from "./SeverityBars";

export type NoticeItem = {
  severity: SeverityLevel;
  /** เช่น "Aspirin + Warfarin" */
  title: string;
  /** คำอธิบายกลไก ไม่มีก็ได้ (ข้อมูลยา-ยาของ DDInter ส่วนใหญ่มีแค่ระดับความรุนแรง) */
  body?: string | null;
};

type InteractionNoticeProps =
  | { state: "checking" }
  | { state: "unchecked"; reason?: string }
  | { state: "none"; compared: number; subject?: string }
  | { state: "found"; items: NoticeItem[]; context: string; footer?: string };

/** แสดงกี่รายการก่อนพับเก็บ ไม่ให้กล่องคำเตือนดันฟอร์มจนหาช่องกรอกไม่เจอ */
const COLLAPSED_ITEMS = 3;

/** สีของแถบระดับบนพื้นขาว (ส่วนหัวใช้สีของ severityMeta) */
const BAR_COLOR: Record<SeverityLevel, string> = {
  major: colors.danger,
  moderate: colors.warn,
  minor: colors.textMuted,
};

const LABEL_COLOR: Record<SeverityLevel, string> = {
  major: colors.dangerText,
  moderate: colors.warnText,
  minor: colors.textSoft,
};

/**
 * ผลตรวจปฏิกิริยา 4 แบบ ต้องหน้าตาไม่เหมือนกันเลย
 *
 *   กำลังตรวจ   วงหมุน + "กรอกต่อได้เลย" (ไม่บล็อกผู้ใช้)
 *   ยังไม่ได้ตรวจ ลายทางเฉียง + ขอบประ — ไม่ได้แปลว่าปลอดภัย
 *   ตรวจแล้วไม่พบ ฟ้าอ่อน + ✓ + จำนวนรายการที่เทียบ
 *   พบ           กล่องเดียวรวมทุกคู่ หัวกล่องสีตามระดับที่รุนแรงที่สุด ▮▮▮ แดง · ▮▮ ส้ม · ▮ เทา
 *
 * ถ้า "ยังไม่ได้ตรวจ" หน้าตาเหมือน "ไม่พบ" ผู้ใช้จะเข้าใจผิดว่าปลอดภัย ซึ่งอันตรายที่สุด
 */
export default function InteractionNotice(props: InteractionNoticeProps) {
  if (props.state === "checking") {
    return (
      <View style={[styles.box, styles.checking]} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.primary} />
        <AppText variant="label" style={styles.flex}>
          กำลังตรวจกับยาที่กินอยู่… กรอกต่อได้เลย
        </AppText>
      </View>
    );
  }

  if (props.state === "unchecked") {
    return (
      <Hatch style={styles.hatch}>
        <AppText variant="small" weight="bold">
          ? ยังไม่ได้ตรวจ · ไม่ได้แปลว่าปลอดภัย
        </AppText>
        {props.reason ? (
          <AppText variant="small" color="#2B3444">
            {props.reason}
          </AppText>
        ) : null}
      </Hatch>
    );
  }

  if (props.state === "none") {
    return (
      <View style={[styles.box, styles.none]}>
        <MaterialCommunityIcons name="check-bold" size={16} color={colors.onHeroText} />
        <AppText variant="small" weight="bold" color={colors.onHeroText} style={styles.flex}>
          {`ตรวจแล้ว ไม่พบ${props.subject ? ` ${props.subject}` : ""} · เทียบ ${props.compared} รายการ`}
        </AppText>
      </View>
    );
  }

  return <FoundList items={props.items} context={props.context} footer={props.footer} />;
}

/** นับแยกตามระดับ เช่น "อันตราย 1 · ควรระวัง 5" (ไม่เอาระดับสูงสุดไปเหมารวมทั้งหมด) */
export function severitySummary(levels: SeverityLevel[]) {
  return (["major", "moderate", "minor"] as SeverityLevel[])
    .map((level) => ({ level, count: levels.filter((item) => item === level).length }))
    .filter((item) => item.count > 0)
    .map((item) => `${severityMeta[item.level].label} ${item.count}`)
    .join(" · ");
}

function FoundList({ items, context, footer }: { items: NoticeItem[]; context: string; footer?: string }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => severityMeta[b.severity].rank - severityMeta[a.severity].rank);
  const top = sorted[0]?.severity ?? "minor";
  const topMeta = severityMeta[top];
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED_ITEMS);
  const hidden = sorted.length - shown.length;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: top === "major" ? colors.danger : topMeta.border,
          backgroundColor: top === "major" ? "#FDF1F1" : top === "moderate" ? colors.warnSurface : colors.surface,
        },
      ]}
    >
      <View style={[styles.cardHeader, { backgroundColor: topMeta.background }]}>
        <View style={styles.headerLeft}>
          <SeverityBars level={top} color={topMeta.color} />
          <AppText variant="small" weight="bold" color={topMeta.color}>
            {severitySummary(sorted.map((item) => item.severity))}
          </AppText>
        </View>
        <AppText variant="small" weight="bold" color={topMeta.color}>
          {context}
        </AppText>
      </View>

      {shown.map((item, index) => (
        <View
          key={`${item.title}-${index}`}
          style={[styles.row, index > 0 && styles.rowDivider]}
          accessible
          accessibilityLabel={`${severityMeta[item.severity].label} ${item.title} ${item.body ?? ""}`}
        >
          <View style={styles.rowBars}>
            <SeverityBars level={item.severity} color={BAR_COLOR[item.severity]} />
          </View>
          <View style={styles.flex}>
            <AppText variant="label" weight="bold">
              {item.title}
            </AppText>
            {item.body ? (
              <AppText variant="small" color={colors.textSoft}>
                {item.body}
              </AppText>
            ) : null}
          </View>
          <AppText variant="meta" weight="bold" color={LABEL_COLOR[item.severity]}>
            {severityMeta[item.severity].label}
          </AppText>
        </View>
      ))}

      {sorted.length > COLLAPSED_ITEMS ? (
        <Pressable
          onPress={() => setExpanded((current) => !current)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <AppText variant="label" color={colors.primaryText}>
            {expanded ? "ย่อรายการ" : `ดูอีก ${hidden} รายการ`}
          </AppText>
          <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.primaryText} />
        </Pressable>
      ) : null}

      {footer ? (
        <View style={styles.footer}>
          <AppText variant="meta" weight="regular" color={colors.textSoft}>
            {footer}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: radius.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  checking: {
    backgroundColor: colors.surface,
  },
  none: {
    backgroundColor: colors.primaryTint,
  },
  hatch: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  card: {
    borderWidth: 1.5,
    borderRadius: 18,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(26,34,48,0.08)",
  },
  rowBars: {
    paddingTop: 5,
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: "rgba(26,34,48,0.08)",
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    paddingHorizontal: 14,
    paddingBottom: 11,
    paddingTop: 2,
  },
});
