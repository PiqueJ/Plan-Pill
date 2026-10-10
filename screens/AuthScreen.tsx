import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Hatch from "../components/ui/Hatch";
import Segmented from "../components/ui/Segmented";
import TextField from "../components/ui/TextField";
import { DISCLAIMER, colors, gradientDirection, gradients, radius } from "../constants/theme";
import { CredentialErrors, MIN_PASSWORD_LENGTH, signIn, signUp, validateCredentials } from "../services/auth";

type Mode = "signin" | "signup";

type Notice = { tone: "danger" | "network" | "info"; text: string } | null;

/** แยกข้อความ "หัวข้อ · รายละเอียด" ให้หัวข้อเป็นตัวหนา */
function splitNotice(text: string) {
  const [head, ...rest] = text.split(" · ");
  return { head, rest: rest.join(" · ") };
}

/**
 * หน้า 01 เข้าสู่ระบบ / สมัคร
 *
 * ใช้หน้าจอเดียว สลับโหมดด้วยแถบด้านบน เพราะฟอร์มเหมือนกันทุกช่อง
 * ข้อความผิดพลาดบอกวิธีแก้เสมอ และแยก "รหัสผ่านผิด" ออกจาก "เน็ตหลุด" ให้ชัด
 * ผู้ใช้จะได้ไม่เปลี่ยนรหัสผ่านทั้งที่ปัญหาอยู่ที่อินเทอร์เน็ต
 */
export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signin");
  // ช่องเดียวรับได้ทั้งอีเมลและชื่อผู้ใช้ (มี @ = อีเมล)
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === "signup";

  /** แก้ช่องไหนแล้วลบ error ของช่องนั้นทันที ไม่ต้องรอกดปุ่มอีกรอบ */
  function clearError(...keys: (keyof CredentialErrors)[]) {
    setErrors((current) => {
      const next = { ...current };
      keys.forEach((key) => delete next[key]);
      return next;
    });
  }

  function changeMode(next: Mode) {
    setMode(next);
    setConfirm("");
    setErrors({});
    setNotice(null);
  }

  async function handleSubmit() {
    const validationErrors = validateCredentials(identifier, password, isSignUp ? confirm : undefined);

    setErrors(validationErrors);
    setNotice(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const result = isSignUp ? await signUp(identifier, password) : await signIn(identifier, password);

      if (result.user && !result.session && result.error) {
        // สมัครได้แล้ว แต่โปรเจกต์ยังเปิดยืนยันอีเมลอยู่ ไม่ใช่ข้อผิดพลาด
        setNotice({ tone: "info", text: result.error });
        return;
      }

      if (result.error) {
        setNotice({ tone: result.errorKind === "network" ? "network" : "danger", text: result.error });
      }

      // สำเร็จแล้วไม่ต้องนำทางเอง onAuthChange ใน _layout จะสลับหน้าจอให้
    } finally {
      setSubmitting(false);
    }
  }

  const noticeText = notice ? splitNotice(notice.text) : null;

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={gradients.hero}
            start={gradientDirection.start}
            end={gradientDirection.end}
            style={[styles.hero, { paddingTop: insets.top + 64 }]}
          >
            <View style={styles.logo}>
              <MaterialCommunityIcons name="pill" size={28} color={colors.onPrimary} />
            </View>
            <AppText variant="drugHero" color={colors.onPrimary} accessibilityRole="header">
              PlanPill
            </AppText>
            <AppText variant="bodyStrong" weight="regular" color={colors.onPrimaryMuted}>
              ตัวช่วยจำเรื่องยาและมื้ออาหาร
            </AppText>
          </LinearGradient>

          <View style={styles.form}>
            <Segmented
              options={[
                { value: "signin", label: "เข้าสู่ระบบ" },
                { value: "signup", label: "สมัครใหม่" },
              ]}
              value={mode}
              onChange={changeMode}
              accessibilityLabel="เลือกเข้าสู่ระบบหรือสมัครใหม่"
            />
            <AppText variant="small" color={colors.textMuted} style={styles.modeHint}>
              {isSignUp ? "สมัครด้วยอีเมล หรือตั้งชื่อผู้ใช้ก็ได้ ใช้ไม่ถึงหนึ่งนาที" : "ใช้บัญชีที่มีอยู่แล้ว"}
            </AppText>

            <TextField
              label="อีเมลหรือชื่อผู้ใช้"
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                clearError("identifier");
              }}
              placeholder="somchai@gmail.com หรือ somchai_99"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              editable={!submitting}
              error={errors.identifier}
              helper={isSignUp ? "ชื่อผู้ใช้: a-z 0-9 _ . ยาว 3–20 ตัว" : undefined}
            />

            <TextField
              label="รหัสผ่าน"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearError("password", "confirm");
              }}
              placeholder={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              editable={!submitting}
              error={errors.password}
              helper={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
              onSubmitEditing={isSignUp ? undefined : handleSubmit}
              right={
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  style={({ pressed }) => [styles.reveal, pressed && styles.revealPressed]}
                >
                  <AppText variant="small" weight="semibold" color={colors.tertiaryText}>
                    {showPassword ? "ซ่อน" : "ดู"}
                  </AppText>
                </Pressable>
              }
            />

            {isSignUp ? (
              <TextField
                label="ยืนยันรหัสผ่าน"
                value={confirm}
                onChangeText={(text) => {
                  setConfirm(text);
                  clearError("confirm");
                }}
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!submitting}
                error={errors.confirm}
                // บอกทันทีเมื่อพิมพ์ครบแล้วตรงกัน ผู้ใช้ไม่ต้องรอกดสมัครถึงจะรู้
                helper={confirm && confirm === password ? "รหัสผ่านตรงกันแล้ว" : undefined}
                onSubmitEditing={handleSubmit}
              />
            ) : null}

            {notice && noticeText ? (
              notice.tone === "network" ? (
                <Hatch style={styles.notice}>
                  <AppText variant="small">
                    <AppText variant="small" weight="bold">
                      {noticeText.head}
                    </AppText>
                    {noticeText.rest ? ` · ${noticeText.rest}` : ""}
                  </AppText>
                </Hatch>
              ) : (
                <View
                  style={[styles.notice, notice.tone === "info" ? styles.noticeInfo : styles.noticeDanger]}
                  accessibilityLiveRegion="polite"
                >
                  <AppText variant="small" color={notice.tone === "info" ? colors.onHeroText : colors.dangerDeep}>
                    <AppText
                      variant="small"
                      weight="bold"
                      color={notice.tone === "info" ? colors.onHeroText : colors.dangerDeep}
                    >
                      {noticeText.head}
                    </AppText>
                    {noticeText.rest ? ` · ${noticeText.rest}` : ""}
                  </AppText>
                </View>
              )
            ) : null}

            <Button
              label={isSignUp ? "สมัครใหม่" : "เข้าสู่ระบบ"}
              loadingLabel={isSignUp ? "กำลังสมัคร…" : "กำลังเข้าสู่ระบบ…"}
              loading={submitting}
              onPress={handleSubmit}
              style={styles.submit}
            />
          </View>

          <AppText variant="meta" weight="regular" color={colors.textMuted} align="center" style={styles.disclaimer}>
            {DISCLAIMER}
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexGrow: 1,
  },
  hero: {
    paddingHorizontal: 26,
    paddingBottom: 30,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.onPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  form: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 14,
  },
  modeHint: {
    marginTop: -4,
  },
  reveal: {
    width: 52,
    height: 44,
    borderRadius: radius.small,
    backgroundColor: colors.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  revealPressed: {
    backgroundColor: "#E1E9F2",
  },
  notice: {
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  noticeDanger: {
    backgroundColor: colors.dangerTint,
  },
  noticeInfo: {
    backgroundColor: colors.primaryTint,
  },
  submit: {
    marginTop: 6,
  },
  disclaimer: {
    marginTop: "auto",
    paddingHorizontal: 26,
    paddingTop: 28,
  },
});
