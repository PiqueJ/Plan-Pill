import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { colors, radius, shadow } from "../../constants/theme";
import { DialogRequest, registerDialogHost, runDialogAction } from "../../services/dialog";
import AppText from "./AppText";
import Button from "./Button";

/**
 * กล่องโต้ตอบของแอป วางไว้ครั้งเดียวที่ root layout
 *
 * รับคำขอจาก services/dialog.ts แล้วแสดงทีละกล่องตามลำดับ
 * ปุ่มลบเป็นสีแดงเฉพาะในกล่องนี้ (Build Kit: Danger · เฉพาะในกล่องยืนยัน)
 * แตะนอกกล่องเท่ากับกดยกเลิก ยกเว้นกล่องที่มีปุ่มเดียว
 */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(
    () =>
      registerDialogHost((request) => {
        setQueue((items) => [...items, request]);
      }),
    []
  );

  function close() {
    setQueue((items) => items.slice(1));
  }

  function press(action?: () => void | Promise<void>) {
    close();
    runDialogAction(action);
  }

  const cancel = current?.buttons.find((button) => button.variant === "tertiary");

  return (
    <Modal
      visible={current !== null}
      transparent
      animationType="fade"
      onRequestClose={() => press(cancel?.onPress)}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => (current && current.buttons.length > 1 ? press(cancel?.onPress) : undefined)}
          accessibilityLabel="ปิดกล่องนี้"
        />
        {current ? (
          <View style={styles.box} accessibilityViewIsModal accessibilityRole="alert">
            <AppText variant="heading" align="center" accessibilityRole="header">
              {current.title}
            </AppText>
            {current.message ? (
              <AppText variant="body" color={colors.textSoft} align="center">
                {current.message}
              </AppText>
            ) : null}
            <View style={current.layout === "row" ? styles.row : styles.column}>
              {current.buttons.map((button) => (
                <Button
                  key={button.label}
                  label={button.label}
                  variant={button.variant ?? "primary"}
                  size="md"
                  onPress={() => press(button.onPress)}
                  style={current.layout === "row" ? styles.flex : undefined}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(26,34,48,0.45)",
  },
  box: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 10,
    ...shadow.hero,
  },
  row: {
    flexDirection: "row",
    gap: 9,
    marginTop: 8,
  },
  column: {
    gap: 8,
    marginTop: 8,
  },
  flex: {
    flex: 1,
  },
});
