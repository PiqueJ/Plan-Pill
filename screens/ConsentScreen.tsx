import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState } from "react";
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import ProgressBar from "../components/ui/ProgressBar";
import { colors, gradientDirection, gradients, radius, shadow } from "../constants/theme";
import { acceptConsent } from "../services/storage";

const POINTS = [
  {
    title: "เก็บแค่ชื่อยา ขนาด เวลา และมื้ออาหาร",
    body: "ไม่เก็บโรคประจำตัว ผลตรวจ หรือข้อมูลที่ระบุตัวตน",
  },
  {
    title: "ข้อมูลอยู่ในเครื่องและซิงค์ขึ้นระบบ",
    body: "แต่ละบัญชีเห็นเฉพาะของตัวเอง ไม่แบ่งให้ใคร",
  },
  {
    title: "“บันทึกแล้ว” คือคุณกดปุ่ม ไม่ใช่เรารู้ว่ากินจริง",
    body: "แอปรู้แค่การกดของคุณเท่านั้น",
  },
  {
    title: "เป็นเครื่องมือช่วยจำ ไม่ใช่คำวินิจฉัย",
    body: "ต้นแบบเพื่อการศึกษา คำเตือนเรื่องยาตีกันครอบคลุมเฉพาะข้อมูลที่มีในระบบ ปรึกษาแพทย์หรือเภสัชกรทุกครั้ง",
  },
];

type ConsentScreenProps = {
  onAccept: () => void;
  /** เปิดอ่านซ้ำจากหน้าตั้งค่า ไม่ต้องบังคับเลื่อนอ่านและไม่บันทึกการยอมรับซ้ำ */
  reviewing?: boolean;
};

/**
 * หน้า 02 คำชี้แจงก่อนใช้งาน
 *
 * ปุ่มรับทราบกดได้เมื่อเลื่อนอ่านถึงข้อสุดท้ายแล้วเท่านั้น
 * ข้อที่อ่านล่าสุดเป็นการ์ดไล่เฉด ข้อที่ยังไม่ถึงจางลง ผู้ใช้เห็นว่าเหลืออีกกี่ข้อ
 * ถ้าจอสูงพอจะเห็นครบทุกข้อตั้งแต่แรก ก็กดได้เลย
 */
export default function ConsentScreen({ onAccept, reviewing = false }: ConsentScreenProps) {
  const insets = useSafeAreaInsets();
  // ตำแหน่งขอบล่างของการ์ดแต่ละใบ และขอบล่างของส่วนที่มองเห็น ไม่ต้องวาดใหม่เมื่อเปลี่ยน จึงเก็บใน ref
  const cardBottoms = useRef<number[]>([]);
  const viewportBottom = useRef(0);
  const [readCount, setReadCount] = useState(reviewing ? POINTS.length : 0);
  const [saving, setSaving] = useState(false);

  function updateRead() {
    const bottoms = cardBottoms.current;
    const visibleBottom = viewportBottom.current;

    if (reviewing || bottoms.filter((value) => value !== undefined).length < POINTS.length) {
      return;
    }

    let count = 0;

    // นับเฉพาะข้อที่เห็นครบทั้งการ์ดต่อเนื่องจากข้อแรก
    while (count < bottoms.length && bottoms[count] <= visibleBottom + 4) {
      count += 1;
    }

    // อ่านแล้วนับว่าอ่านแล้ว เลื่อนกลับขึ้นไปก็ไม่ลด
    setReadCount((current) => Math.max(current, count));
  }

  function handleCardLayout(index: number, event: LayoutChangeEvent) {
    const { y, height } = event.nativeEvent.layout;

    cardBottoms.current[index] = y + height;
    updateRead();
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    viewportBottom.current = contentOffset.y + layoutMeasurement.height;
    updateRead();
  }

  async function handleAccept() {
    if (reviewing) {
      onAccept();
      return;
    }

    setSaving(true);
    await acceptConsent();
    onAccept();
  }

  const allRead = readCount >= POINTS.length;
  const current = Math.max(0, readCount - 1);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          ก่อนเริ่ม ขอเล่า 4 ข้อ
        </AppText>
        <View style={styles.progressRow}>
          <ProgressBar
            segments={[{ value: readCount, color: colors.primary }]}
            total={POINTS.length}
            height={8}
            style={styles.flex}
          />
          <AppText variant="meta" weight="bold" color={colors.primaryText}>
            {`${readCount}/${POINTS.length}`}
          </AppText>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.list}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(event) => {
          viewportBottom.current = event.nativeEvent.layout.height;
          updateRead();
        }}
      >
        {POINTS.map((point, index) => {
          const isCurrent = index === current && readCount > 0 && !reviewing;
          const isUnread = index >= readCount;

          const inner = (
            <>
              <View style={[styles.number, isCurrent && styles.numberOnHero]}>
                <AppText variant="label" weight="bold" color={isCurrent ? colors.primaryDeep : colors.primaryText}>
                  {index + 1}
                </AppText>
              </View>
              <View style={styles.flex}>
                <AppText variant="itemTitle" color={isCurrent ? colors.onPrimary : colors.text}>
                  {point.title}
                </AppText>
                <AppText variant="small" color={isCurrent ? colors.onPrimaryMuted : colors.textMuted}>
                  {point.body}
                </AppText>
              </View>
            </>
          );

          return (
            <View
              key={point.title}
              onLayout={(event) => handleCardLayout(index, event)}
              style={isUnread ? styles.unread : undefined}
            >
              {isCurrent ? (
                <LinearGradient
                  colors={gradients.hero}
                  start={gradientDirection.start}
                  end={gradientDirection.end}
                  style={[styles.card, shadow.hero]}
                >
                  {inner}
                </LinearGradient>
              ) : (
                <View style={[styles.card, styles.cardPlain]}>{inner}</View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {!allRead ? (
          <AppText variant="meta" weight="regular" color={colors.textMuted} align="center">
            {`เลื่อนอ่านให้ถึงข้อ ${POINTS.length} ก่อนนะคะ`}
          </AppText>
        ) : null}
        <Button
          label={reviewing ? "อ่านแล้ว ปิดหน้านี้" : "รับทราบและเริ่มใช้งาน"}
          onPress={handleAccept}
          disabled={!allRead}
          loading={saving}
        />
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
  header: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    gap: 12,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  list: {
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 10,
  },
  card: {
    flexDirection: "row",
    gap: 13,
    borderRadius: radius.card,
    padding: 16,
  },
  cardPlain: {
    backgroundColor: colors.surface,
  },
  unread: {
    opacity: 0.45,
  },
  number: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  numberOnHero: {
    backgroundColor: colors.onPrimary,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    gap: 9,
  },
});
