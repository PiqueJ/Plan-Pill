import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { colors, radius } from "../../constants/theme";
import AppText from "./AppText";

/** แถบเลิกทำค้างไว้ 6 วินาที (Build Kit หัวข้อ 03) */
export const UNDO_DURATION_MS = 6000;

let undoCounter = 0;

/** key ใหม่ทุกครั้งที่บันทึก ให้แถบเริ่มนับถอยหลังใหม่ แม้ข้อความจะเหมือนเดิม */
export function nextUndoKey() {
  undoCounter += 1;
  return undoCounter;
}

/**
 * แถบ "บันทึกแล้ว 12:34 · เลิกทำ" พร้อมเส้นนับถอยหลัง
 *
 * แตะครั้งเดียวบันทึกทันที ไม่มีกล่องถามซ้ำ ถ้ากดผิดแก้ได้จากแถบนี้
 * หมดเวลาแล้วยังแก้ได้จากหน้าประวัติ
 *
 * ให้ parent ใส่ key ใหม่ทุกครั้งที่บันทึก แถบจะเริ่มนับใหม่เอง
 */
export default function UndoBar({
  message,
  onUndo,
  onDone,
  duration = UNDO_DURATION_MS,
}: {
  message: string;
  onUndo: () => void;
  onDone: () => void;
  duration?: number;
}) {
  const [progress] = useState(() => new Animated.Value(1));
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished) {
        onDoneRef.current();
      }
    });

    return () => animation.stop();
  }, [duration, progress]);

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <View style={styles.row}>
        <AppText variant="label" weight="medium" color={colors.onPrimary} style={styles.message}>
          {message}
        </AppText>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="เลิกทำการบันทึกนี้"
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <AppText variant="label" weight="bold" color={colors.onInkAction}>
            เลิกทำ
          </AppText>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.countdown, { transform: [{ scaleX: progress }] }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 14,
    backgroundColor: colors.ink,
    borderRadius: radius.field,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
  },
  message: {
    flex: 1,
  },
  action: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: {
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  countdown: {
    height: 3,
    backgroundColor: colors.onInkAction,
    transformOrigin: "left",
  },
});
