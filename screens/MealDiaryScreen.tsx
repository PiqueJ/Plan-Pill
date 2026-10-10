import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MealCard, { MealWarning } from "../components/MealCard";
import AppText from "../components/ui/AppText";
import { EmptyCard } from "../components/ui/Card";
import Chip from "../components/ui/Chip";
import Fab from "../components/ui/Fab";
import { ScreenTitle } from "../components/ui/Headers";
import { colors, severityMeta } from "../constants/theme";
import { getAlerts } from "../services/alerts";
import { getFoodCategoryLabels } from "../services/drugs";
import { getMeals } from "../services/meals";
import { getMealPhotoUrls } from "../services/photos";
import { formatDayLabel } from "../services/schedule";
import { getMedications } from "../services/storage";
import { Meal } from "../types";

type Range = "7" | "30" | "all";

const RANGE_LABEL: Record<Range, string> = {
  "7": "7 วันล่าสุด",
  "30": "30 วันล่าสุด",
  all: "ทั้งหมด",
};

type Section = { title: string; data: Meal[] };

const DAY_MS = 24 * 60 * 60 * 1000;

/** ตัดส่วน " · มื้อ ..." ท้ายข้อความคำเตือนออก เพราะการ์ดบอกชื่อมื้ออยู่แล้ว */
function alertText(message: string) {
  return message.split(" · ")[0];
}

/**
 * หน้า 07 ไดอารี่อาหาร
 *
 * ค่าเริ่มต้นแสดง 7 วัน ให้หน้าไม่ยาวเกินไป ตัวกรอง "มีคำเตือน" เป็นสีส้ม
 * เพราะเป็นทางลัดไปหามื้อที่ควรเล่าให้เภสัชกรฟัง
 */
export default function MealDiaryScreen() {
  const insets = useSafeAreaInsets();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [foodLabels, setFoodLabels] = useState<Record<string, string>>({});
  const [riskCodes, setRiskCodes] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<Record<string, MealWarning>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [range, setRange] = useState<Range>("7");
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // เวลาที่โหลดล่าสุด ใช้ตัดช่วง 7/30 วัน (อ่านเวลาปัจจุบันระหว่างวาดหน้าจอไม่ได้)
  const [loadedAt, setLoadedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadDiary = useCallback(async () => {
    const [saved, labels, medications, alerts] = await Promise.all([
      getMeals(),
      getFoodCategoryLabels(),
      getMedications(),
      getAlerts(),
    ]);

    setMeals(saved);
    setFoodLabels(labels);
    setRiskCodes([
      ...new Set(medications.filter((item) => item.status === "active").flatMap((item) => item.foodRiskCodes)),
    ]);

    // เก็บคำเตือนระดับสูงสุดของแต่ละมื้อไว้แสดงบนแถบล่างของการ์ด
    const byMeal: Record<string, MealWarning> = {};

    for (const alert of alerts) {
      if (!alert.mealId) continue;
      const current = byMeal[alert.mealId];

      if (!current || severityMeta[alert.severity].rank > severityMeta[current.severity].rank) {
        byMeal[alert.mealId] = { severity: alert.severity, text: alertText(alert.messageTh) };
      }
    }

    setWarnings(byMeal);
    setLoadedAt(Date.now());
    setLoaded(true);

    // ขอ URL ของรูปทั้งหน้าในครั้งเดียว แทนที่จะยิงทีละการ์ด
    const paths = saved.map((meal) => meal.photoPath).filter((path): path is string => Boolean(path));
    setPhotoUrls(paths.length > 0 ? await getMealPhotoUrls(paths) : {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDiary();
    }, [loadDiary])
  );

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await loadDiary();
    } finally {
      setRefreshing(false);
    }
  }

  const isFlagged = (meal: Meal) => Boolean(warnings[meal.id]) || meal.foodCodes.some((code) => riskCodes.includes(code));
  const cutoff = range === "all" ? 0 : loadedAt - Number(range) * DAY_MS;
  const inRange = meals.filter((meal) => new Date(meal.eatenAt).getTime() >= cutoff);
  const flaggedInRange = inRange.filter(isFlagged).length;
  const visible = onlyWarnings ? inRange.filter(isFlagged) : inRange;

  const sections: Section[] = [];

  for (const meal of visible) {
    const title = formatDayLabel(meal.eatenAt);
    const existing = sections.find((section) => section.title === title);

    if (existing) {
      existing.data.push(meal);
    } else {
      sections.push({ title, data: [meal] });
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <View>
            <ScreenTitle
              title="ไดอารี่อาหาร"
              // นับตามช่วงที่เลือก ให้ตรงกับตัวเลขบนชิป "มีคำเตือน" (เดิมนับทั้งหมด ตัวเลขสองที่ไม่ตรงกัน)
              subtitle={
                meals.length > 0
                  ? `${RANGE_LABEL[range]} ${inRange.length} มื้อ · มีคำเตือน ${flaggedInRange} มื้อ`
                  : undefined
              }
            />
            {meals.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Chip label="7 วัน" selected={range === "7"} onPress={() => setRange("7")} />
                <Chip label="30 วัน" selected={range === "30"} onPress={() => setRange("30")} />
                <Chip label="ทั้งหมด" selected={range === "all"} onPress={() => setRange("all")} />
                {flaggedInRange > 0 || onlyWarnings ? (
                  <Chip
                    label={`มีคำเตือน ${flaggedInRange}`}
                    warn={!onlyWarnings}
                    check
                    selected={onlyWarnings}
                    onPress={() => setOnlyWarnings((current) => !current)}
                  />
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <AppText variant="small" weight="bold" color={colors.textSoft} accessibilityRole="header">
              {section.title}
            </AppText>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MealCard
              meal={item}
              foodLabels={foodLabels}
              riskCodes={riskCodes}
              warning={warnings[item.id] ?? null}
              photoUrl={item.photoPath ? photoUrls[item.photoPath] : null}
              onPress={() => router.push(`/(tabs)/meals/edit/${item.id}` as any)}
            />
          </View>
        )}
        ListEmptyComponent={
          !loaded ? null : (
            <View style={styles.item}>
              {meals.length === 0 ? (
                <EmptyCard title="ยังไม่มีมื้ออาหาร" body="จดสิ่งที่กิน เราจะช่วยดูว่าตีกับยาหรือไม่" />
              ) : (
                <EmptyCard
                  title={onlyWarnings ? "ไม่มีมื้อที่มีคำเตือนในช่วงนี้" : "ไม่มีมื้อในช่วงนี้"}
                  actionLabel="ดูทั้งหมด"
                  onAction={() => {
                    setRange("all");
                    setOnlyWarnings(false);
                  }}
                />
              )}
            </View>
          )
        }
      />

      <Fab label="บันทึกมื้อ" onPress={() => router.push("/(tabs)/meals/new" as any)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 110,
  },
  chips: {
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  sectionHeader: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 8,
  },
  item: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
});
