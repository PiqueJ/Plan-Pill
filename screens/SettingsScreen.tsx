import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import { FONT_SCALES, useFontScale } from "../components/ui/FontScale";
import { ScreenTitle } from "../components/ui/Headers";
import TextField from "../components/ui/TextField";
import { DISCLAIMER, colors, gradientDirection, gradients, radius } from "../constants/theme";
import { clearAlerts } from "../services/alerts";
import { displayIdentifier, getSession, signOut } from "../services/auth";
import { confirmAction, showMessage } from "../services/dialog";
import {
  PermissionStatus,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from "../services/notifications";
import { countPending } from "../services/outbox";
import { clearDoseLogs, clearLocalData, getMedications, syncPendingWrites } from "../services/storage";
import ConsentScreen from "./ConsentScreen";

/** คำที่ต้องพิมพ์ก่อนล้างประวัติ กันกดพลาดกับการกระทำที่ย้อนกลับไม่ได้ */
const CLEAR_WORD = "ล้างประวัติ";

type SyncState = "idle" | "syncing" | "failed";

/**
 * หน้า 10 ตั้งค่า
 *
 * สิทธิ์แจ้งเตือนมี 3 หน้าตา เปิดอยู่ (ฟ้า) · ยังไม่ได้ขอ (ส้ม) · ถูกปฏิเสธ (แดง)
 * เพราะถ้าไม่ได้สิทธิ์ แอปยังบันทึกได้แต่จะเงียบตอนถึงเวลา ผู้ใช้ต้องรู้ข้อนี้ชัด ๆ
 *
 * ล้างประวัติต้องพิมพ์คำยืนยัน เพราะเป็นการกระทำเดียวในแอปที่ย้อนกลับไม่ได้
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { scale, setScale } = useFontScale();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionStatus>("undetermined");
  const [activeCount, setActiveCount] = useState(0);
  const [perDay, setPerDay] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearText, setClearText] = useState("");
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    const [permissionStatus, medications, session] = await Promise.all([
      Platform.OS === "web" ? Promise.resolve<PermissionStatus>("undetermined") : getNotificationPermissionStatus(),
      getMedications(),
      getSession(),
    ]);
    const active = medications.filter((item) => item.status === "active");

    setPermission(permissionStatus);
    setActiveCount(active.length);
    setPerDay(active.reduce((sum, item) => sum + item.reminderTimes.length, 0));
    // บัญชีที่สมัครด้วยชื่อผู้ใช้ แสดงชื่อผู้ใช้ ไม่แสดงอีเมลภายใน
    setEmail(displayIdentifier(session?.user.email));
    setUserId(session?.user.id ?? null);

    if (session) {
      setPendingCount(await countPending(session.user.id));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAllow() {
    const granted = await requestNotificationPermission();
    await load();

    if (!granted) {
      showMessage("ยังไม่ได้รับสิทธิ์", "ยังบันทึกได้ปกติ แต่จะไม่เตือนเมื่อถึงเวลา เปิดได้จากตั้งค่าของเครื่อง");
    }
  }

  async function handleSync() {
    if (!userId) {
      return;
    }

    setSyncState("syncing");

    try {
      await syncPendingWrites();
      const left = await countPending(userId);
      setPendingCount(left);
      setLastSync(new Date());
      setSyncState(left > 0 ? "failed" : "idle");
    } catch {
      setSyncState("failed");
    }
  }

  function cycleFontScale() {
    const index = FONT_SCALES.findIndex((item) => item.value === scale);
    setScale(FONT_SCALES[(index + 1) % FONT_SCALES.length].value);
  }

  function handleSignOut() {
    confirmAction({
      title: "ออกจากระบบ",
      message: "ข้อมูลของคุณยังอยู่ครบ เข้าสู่ระบบใหม่เมื่อไรก็เห็นเหมือนเดิม",
      confirmLabel: "ออกจากระบบ",
      onConfirm: async () => {
        // ลบ cache ก่อนออกจากระบบ ไม่ให้ข้อมูลค้างในเครื่องที่คนอื่นอาจใช้ต่อ
        // ต้องทำก่อน signOut เพราะหลังออกจากระบบจะไม่รู้แล้วว่า cache เป็นของใคร
        await clearLocalData();

        const error = await signOut();

        if (error) {
          showMessage("ออกจากระบบไม่สำเร็จ", error);
        }
        // สำเร็จแล้วไม่ต้องนำทางเอง onAuthChange ใน _layout จะสลับหน้าให้
      },
    });
  }

  async function handleClearHistory() {
    setClearing(true);

    try {
      await Promise.all([clearDoseLogs(), clearAlerts()]);
      setShowClear(false);
      setClearText("");
      // รอให้แผ่นยืนยันปิดก่อน iOS เปิดกล่องใหม่ซ้อนตอนอีกกล่องกำลังปิดไม่ได้
      setTimeout(
        () => showMessage("ล้างประวัติแล้ว", "ประวัติการกินยาและคำเตือนถูกลบ รายการยาและไดอารี่อาหารยังอยู่ครบ"),
        400
      );
    } finally {
      setClearing(false);
    }
  }

  const scaleLabel = FONT_SCALES.find((item) => item.value === scale)?.label ?? "ปกติ";
  const initial = email ? email.charAt(0).toUpperCase() : "?";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle title="ตั้งค่า" />

        <View style={styles.body}>
          <View style={styles.account}>
            <LinearGradient
              colors={gradients.hero}
              start={gradientDirection.start}
              end={gradientDirection.end}
              style={styles.avatar}
            >
              <AppText variant="itemTitle" color={colors.onPrimary}>
                {initial}
              </AppText>
            </LinearGradient>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" weight="bold" numberOfLines={1}>
                {email ?? "ไม่ทราบชื่อบัญชี"}
              </AppText>
              <AppText variant="meta" weight="regular" color={colors.textMuted}>
                เห็นข้อมูลเฉพาะบัญชีนี้
              </AppText>
            </View>
          </View>

          {Platform.OS === "web" ? (
            <View style={[styles.permission, { backgroundColor: colors.neutralTint }]}>
              <AppText variant="small" color={colors.textSoft}>
                <AppText variant="small" weight="bold" color={colors.textSoft}>
                  การแจ้งเตือนใช้ได้บนแอปมือถือ
                </AppText>
                {" · บนเว็บบันทึกได้ แต่จะไม่มีเสียงเตือน"}
              </AppText>
            </View>
          ) : permission === "denied" ? (
            <View style={styles.denied}>
              <View style={styles.deniedRow}>
                <View style={styles.deniedIcon}>
                  <MaterialCommunityIcons name="close-thick" size={15} color={colors.onPrimary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="itemTitle">การแจ้งเตือนถูกปิดอยู่</AppText>
                  <AppText variant="small" color={colors.textSoft}>
                    {"ยังบันทึกได้ปกติ แต่"}
                    <AppText variant="small" weight="bold">
                      จะไม่เตือนเมื่อถึงเวลา
                    </AppText>
                    {" · ต้องเปิดจากตั้งค่าของเครื่อง"}
                  </AppText>
                </View>
              </View>
              <Button label="เปิดตั้งค่าของเครื่อง →" variant="danger" size="md" onPress={() => Linking.openSettings()} />
            </View>
          ) : permission === "undetermined" ? (
            <Pressable
              onPress={handleAllow}
              accessibilityRole="button"
              style={({ pressed }) => [styles.permission, { backgroundColor: colors.warnTint }, pressed && styles.pressed]}
            >
              <AppText variant="small" color={colors.warnText} style={styles.flex}>
                <AppText variant="small" weight="bold" color={colors.warnText}>
                  ? ยังไม่ได้ขอสิทธิ์แจ้งเตือน
                </AppText>
                {" · จะไม่มีเสียงเตือน"}
              </AppText>
              <AppText variant="small" weight="bold" color={colors.warnText}>
                อนุญาต ›
              </AppText>
            </Pressable>
          ) : (
            <View style={[styles.permission, { backgroundColor: colors.primaryTint }]}>
              <MaterialCommunityIcons name="bell-check-outline" size={18} color={colors.onHeroText} />
              <AppText variant="small" color={colors.onHeroText} style={styles.flex}>
                <AppText variant="small" weight="bold" color={colors.onHeroText}>
                  การแจ้งเตือนเปิดอยู่
                </AppText>
                {` · เตือน ${perDay} ครั้งต่อวัน`}
              </AppText>
            </View>
          )}

          <View style={styles.group}>
            <View style={[styles.statsRow, styles.rowDivider]}>
              <View style={[styles.statCell, styles.cellDivider]}>
                <AppText variant="meta" weight="regular" color={colors.textMuted}>
                  ยาที่เปิดเตือน
                </AppText>
                <AppText variant="heading" color={colors.primaryText}>
                  {activeCount}
                </AppText>
              </View>
              <View style={styles.statCell}>
                <AppText variant="meta" weight="regular" color={colors.textMuted}>
                  เตือนต่อวัน
                </AppText>
                <AppText variant="heading" color={colors.primaryText}>
                  {`${perDay} ครั้ง`}
                </AppText>
              </View>
            </View>

            <View style={[styles.row, styles.rowDivider]}>
              {syncState === "syncing" ? (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <AppText variant="bodyStrong" style={styles.flex}>
                    กำลังซิงค์…
                  </AppText>
                </>
              ) : pendingCount > 0 ? (
                <>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" color={syncState === "failed" ? colors.dangerText : colors.text}>
                      {syncState === "failed" ? `✕ ซิงค์ไม่สำเร็จ · รอ ${pendingCount} รายการ` : `● รอซิงค์ ${pendingCount} รายการ`}
                    </AppText>
                    <AppText variant="meta" weight="regular" color={colors.textMuted}>
                      ข้อมูลยังอยู่ในเครื่อง จะส่งขึ้นให้เองเมื่อออนไลน์
                    </AppText>
                  </View>
                  <Button label="ซิงค์เลย" variant="tint" size="sm" onPress={handleSync} />
                </>
              ) : (
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <MaterialCommunityIcons name="cloud-check-outline" size={20} color={colors.primaryText} />
                    <AppText variant="bodyStrong">ซิงค์ครบ</AppText>
                  </View>
                  {lastSync ? (
                    <AppText variant="meta" weight="regular" color={colors.textMuted}>
                      {`ล่าสุด ${String(lastSync.getHours()).padStart(2, "0")}:${String(lastSync.getMinutes()).padStart(2, "0")}`}
                    </AppText>
                  ) : null}
                </View>
              )}
            </View>

            <Pressable
              onPress={cycleFontScale}
              accessibilityRole="button"
              accessibilityLabel={`ขนาดตัวอักษร ${scaleLabel} แตะเพื่อเปลี่ยน`}
              style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressedRow]}
            >
              <AppText variant="bodyStrong" style={styles.flex}>
                ขนาดตัวอักษร
              </AppText>
              <AppText variant="label" color={colors.primaryText}>
                {`${scaleLabel} ›`}
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => setShowConsent(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
            >
              <AppText variant="bodyStrong" style={styles.flex}>
                อ่านคำชี้แจงอีกครั้ง
              </AppText>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.placeholder} />
            </Pressable>
          </View>

          <Button label="ออกจากระบบ" variant="plain" size="md" onPress={handleSignOut} />

          <Pressable
            onPress={() => setShowClear(true)}
            accessibilityRole="button"
            accessibilityHint="ต้องพิมพ์คำยืนยันก่อน"
            style={styles.clearRow}
          >
            <AppText variant="meta" weight="bold" color={colors.dangerText}>
              ล้างประวัติทั้งหมด
            </AppText>
            <AppText variant="tiny" weight="regular" color={colors.textMuted}>
              ต้องพิมพ์คำยืนยัน
            </AppText>
          </Pressable>

          <View style={styles.about}>
            <AppText variant="meta" weight="semibold" color={colors.textSoft} align="center">
              PlanPill · 040333215 Smart Technology 2026 · กลุ่ม 7
            </AppText>
            <AppText variant="meta" weight="regular" color={colors.textMuted} align="center">
              {DISCLAIMER}
            </AppText>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showConsent} animationType="slide" onRequestClose={() => setShowConsent(false)}>
        <ConsentScreen reviewing onAccept={() => setShowConsent(false)} />
      </Modal>

      <Modal visible={showClear} transparent animationType="fade" onRequestClose={() => setShowClear(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowClear(false)} accessibilityLabel="ปิด" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <AppText variant="heading">ล้างประวัติทั้งหมด?</AppText>
            <AppText variant="body" color={colors.textSoft}>
              ประวัติการกินยาและคำเตือนทั้งหมดจะถูกลบ และย้อนกลับไม่ได้ รายการยาและไดอารี่อาหารยังอยู่ครบ
            </AppText>
            <TextField
              label={`พิมพ์ “${CLEAR_WORD}” เพื่อยืนยัน`}
              value={clearText}
              onChangeText={setClearText}
              placeholder={CLEAR_WORD}
              autoCorrect={false}
            />
            <View style={styles.sheetActions}>
              <Button label="ยกเลิก" variant="tertiary" size="md" onPress={() => setShowClear(false)} style={styles.flex} />
              <Button
                label="ลบทิ้ง"
                variant="danger"
                size="md"
                loading={clearing}
                disabled={clearText.trim() !== CLEAR_WORD}
                onPress={handleClearHistory}
                style={styles.flex}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingBottom: 40,
  },
  body: {
    paddingHorizontal: 20,
    gap: 10,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  permission: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  pressed: {
    opacity: 0.8,
  },
  denied: {
    backgroundColor: "#FDF1F1",
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.card,
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 11,
  },
  deniedRow: {
    flexDirection: "row",
    gap: 11,
  },
  deniedIcon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  statsRow: {
    flexDirection: "row",
  },
  statCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cellDivider: {
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pressedRow: {
    backgroundColor: colors.tertiary,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  about: {
    gap: 4,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(26,34,48,0.45)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 22,
    paddingTop: 22,
    gap: 14,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 9,
  },
});
