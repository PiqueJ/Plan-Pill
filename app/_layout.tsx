import {
  Anuphan_400Regular,
  Anuphan_500Medium,
  Anuphan_600SemiBold,
  Anuphan_700Bold,
} from "@expo-google-fonts/anuphan";
import { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import DialogHost from "../components/ui/DialogHost";
import { FontScaleProvider, loadFontScale } from "../components/ui/FontScale";
import { colors } from "../constants/theme";
import { getSession, onAuthChange } from "../services/auth";
import {
  configureNotificationHandler,
  setupNotificationChannel,
  syncMedicationNotifications,
} from "../services/notifications";
import { hasAcceptedConsent, syncPendingWrites } from "../services/storage";
import AuthScreen from "../screens/AuthScreen";
import ConsentScreen from "../screens/ConsentScreen";

export const unstable_settings = {
  anchor: "(tabs)",
};

// ต้องเรียกนอก component เพื่อให้ตั้งค่าเพียงครั้งเดียวตอนแอปโหลด
configureNotificationHandler();

export default function RootLayout() {
  const [checkingStartup, setCheckingStartup] = useState(true);

  /**
   * โหลดฟอนต์ Anuphan ก่อนวาดหน้าจอ (ตามไฟล์ออกแบบ Sky)
   *
   * โหลดเฉพาะน้ำหนักที่แอปใช้จริง 4 ตัว เพราะทุกน้ำหนักคือไฟล์อีกไฟล์ที่ต้องดาวน์โหลด
   *
   * ถ้าโหลดไม่สำเร็จ (fontError) ยังให้แอปทำงานต่อด้วยฟอนต์ระบบ
   * ดีกว่าค้างที่หน้าเปล่าเพราะเรื่องความสวยงามอย่างเดียว
   */
  const [fontsLoaded, fontError] = useFonts({
    Anuphan_400Regular,
    Anuphan_500Medium,
    Anuphan_600SemiBold,
    Anuphan_700Bold,
  });
  // ขนาดตัวอักษรที่ผู้ใช้เลือกไว้ ต้องรู้ก่อนวาดหน้าแรก ไม่งั้นตัวอักษรจะกระโดดเปลี่ยนขนาด
  const [fontScale, setFontScale] = useState(1);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  // เก็บ id ของการแจ้งเตือนที่เปิดไปแล้ว กันไม่ให้เปิดหน้าเดิมซ้ำทุกครั้งที่เข้าแอป
  const handledNotificationId = useRef<string | null>(null);

  useEffect(() => {
    async function prepareApp() {
      await setupNotificationChannel();

      // อ่าน session จาก AsyncStorage ผู้ใช้ที่เคยล็อกอินแล้วจึงไม่ต้องล็อกอินซ้ำ
      const [accepted, savedSession, savedScale] = await Promise.all([
        hasAcceptedConsent(),
        getSession(),
        loadFontScale(),
      ]);

      setConsentAccepted(accepted);
      setSession(savedSession);
      setFontScale(savedScale);
      setCheckingStartup(false);

      // ถ้าการแจ้งเตือนที่เคยตั้งไว้หายไป (เช่น ล้างข้อมูลแอป) ให้ตั้งใหม่อัตโนมัติ
      const repaired = await syncMedicationNotifications();

      if (repaired > 0) {
        console.log(`Rescheduled reminders for ${repaired} medication(s)`);
      }
    }

    prepareApp();
  }, []);

  // ติดตามการล็อกอิน/ออกจากระบบ เพื่อสลับหน้าจอให้อัตโนมัติ
  useEffect(() => onAuthChange(setSession), []);

  // อัปโหลดข้อมูลที่บันทึกไว้ตอนออฟไลน์ ทุกครั้งที่ล็อกอินสำเร็จ
  useEffect(() => {
    if (!session) {
      return;
    }

    syncPendingWrites()
      .then((sent) => {
        if (sent > 0) {
          console.log(`อัปโหลดข้อมูลที่ค้างไว้สำเร็จ ${sent} รายการ`);
        }
      })
      .catch((error) => console.log("Error syncing pending writes:", error));
  }, [session]);

  // ผู้ใช้กดที่การแจ้งเตือน → เปิดหน้ารายละเอียดของยารายการนั้น
  useEffect(() => {
    // expo-notifications ไม่รองรับบนเว็บ จึงข้ามส่วนนี้ไป
    // และต้องล็อกอินอยู่ ไม่งั้นจะพยายามเปิดหน้าที่ยังเข้าไม่ได้
    if (!consentAccepted || !session || Platform.OS === "web") {
      return;
    }

    function openMedicationFromResponse(
      response: Notifications.NotificationResponse | null
    ) {
      if (!response) {
        return;
      }

      const request = response.notification.request;
      const medicationId = request.content.data?.medicationId;

      if (
        typeof medicationId !== "string" ||
        handledNotificationId.current === request.identifier ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        return;
      }

      handledNotificationId.current = request.identifier;

      // withAnchor: ให้มีหน้ารายการยาอยู่ข้างใต้ กดย้อนกลับแล้วไม่หลุดไปหน้าอื่น
      router.push(`/(tabs)/medications/${medicationId}` as any, { withAnchor: true });
    }

    // กรณีเปิดแอปขึ้นมาจากการกดการแจ้งเตือนตอนที่แอปปิดอยู่
    Notifications.getLastNotificationResponseAsync()
      .then(openMedicationFromResponse)
      .catch((error) =>
        console.log("Error reading last notification response:", error)
      );

    // กรณีกดการแจ้งเตือนขณะที่แอปเปิดอยู่
    const subscription = Notifications.addNotificationResponseReceivedListener(
      openMedicationFromResponse
    );

    return () => subscription.remove();
  }, [consentAccepted, session]);

  if (checkingStartup || (!fontsLoaded && !fontError)) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  // ครอบทุกกรณีด้วย provider ตัวเดียวที่ตำแหน่งเดิม React จึงเก็บขนาดตัวอักษรไว้ได้
  // ตอนสลับระหว่างหน้ายินยอม หน้าเข้าสู่ระบบ และตัวแอป
  let content: React.ReactNode;

  if (!consentAccepted) {
    // แสดงคำชี้แจงความเป็นส่วนตัวก่อนเข้าใช้งานครั้งแรก
    content = (
      <>
        <ConsentScreen onAccept={() => setConsentAccepted(true)} />
        <StatusBar style="dark" />
      </>
    );
  } else if (!session) {
    // ต้องล็อกอินก่อนจึงจะเข้าถึงข้อมูลได้ เพราะ RLS ผูกทุกแถวกับ user_id
    // หน้าเข้าสู่ระบบมีหัวไล่เฉดฟ้า ไอคอนแถบสถานะจึงต้องเป็นสีขาว
    content = (
      <>
        <AuthScreen />
        <StatusBar style="light" />
      </>
    );
  } else {
    content = (
      <>
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="dark" />
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <FontScaleProvider initialScale={fontScale}>
        {content}
        {/* กล่องยืนยันของแอป ใช้ร่วมกันทุกหน้า แทนกล่องของระบบ */}
        <DialogHost />
      </FontScaleProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
