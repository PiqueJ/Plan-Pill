import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MedicationCard from "../components/MedicationCard";
import AppText from "../components/ui/AppText";
import Button from "../components/ui/Button";
import Card, { EmptyCard } from "../components/ui/Card";
import Chip from "../components/ui/Chip";
import Fab from "../components/ui/Fab";
import { ScreenTitle } from "../components/ui/Headers";
import SearchField from "../components/ui/SearchField";
import { colors } from "../constants/theme";
import { getMedications } from "../services/storage";
import { Medication, isLowSupply } from "../types";

type Filter = "all" | "active" | "paused" | "low";

/**
 * หน้า 04 ยาของฉัน
 *
 * ค้นหาและกรองในเครื่อง ไม่ต้องรอเซิร์ฟเวอร์
 * ตัวกรอง "ใกล้หมด" เป็นสีส้มเสมอ เพราะเป็นสิ่งที่ต้องจัดการ ไม่ใช่แค่หมวดหมู่
 */
export default function MedicationListScreen() {
  const insets = useSafeAreaInsets();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const loadMedications = useCallback(async () => {
    setMedications(await getMedications());
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMedications();
    }, [loadMedications])
  );

  const activeCount = medications.filter((item) => item.status === "active").length;
  const pausedCount = medications.length - activeCount;
  const lowCount = medications.filter((item) => item.status === "active" && isLowSupply(item)).length;
  const term = query.trim().toLowerCase();

  const visible = medications
    .filter((item) => {
      if (filter === "active") return item.status === "active";
      if (filter === "paused") return item.status === "paused";
      if (filter === "low") return item.status === "active" && isLowSupply(item);
      return true;
    })
    .filter((item) => !term || item.name.toLowerCase().includes(term))
    // ยาที่พักไว้ไปอยู่ท้ายรายการ ยาที่ต้องกินจริงจะได้อยู่บนสุด
    .sort((a, b) => Number(a.status === "paused") - Number(b.status === "paused"));

  const filters: { key: Filter; label: string; warn?: boolean; count: number }[] = [
    { key: "all", label: `ทั้งหมด ${medications.length}`, count: medications.length },
    { key: "active", label: `เปิดเตือน ${activeCount}`, count: activeCount },
    { key: "paused", label: `พักไว้ ${pausedCount}`, count: pausedCount },
    { key: "low", label: `ใกล้หมด ${lowCount}`, warn: true, count: lowCount },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <ScreenTitle
              title="ยาของฉัน"
              subtitle={medications.length > 0 ? `${medications.length} รายการ · เปิดเตือน ${activeCount}` : undefined}
            />
            {medications.length > 0 ? (
              <View style={styles.tools}>
                <SearchField value={query} onChangeText={setQuery} placeholder="ค้นหาชื่อยา" style={styles.search} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {filters
                    .filter((item) => item.key === "all" || item.count > 0)
                    .map((item) => (
                      <Chip
                        key={item.key}
                        label={item.label}
                        selected={filter === item.key}
                        warn={item.warn && filter !== item.key}
                        onPress={() => setFilter(item.key)}
                      />
                    ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MedicationCard medication={item} onPress={() => router.push(`/(tabs)/medications/${item.id}` as any)} />
          </View>
        )}
        ListEmptyComponent={
          !loaded ? null : medications.length === 0 ? (
            <View style={styles.item}>
              <EmptyCard title="ยังไม่มียาในรายการ" body="กดปุ่ม “+ เพิ่มยา” มุมขวาล่าง" />
            </View>
          ) : term ? (
            <View style={styles.item}>
              <Card style={styles.notFound}>
                <AppText variant="itemTitle" align="center">
                  {`ไม่พบ “${query.trim()}”`}
                </AppText>
                <AppText variant="small" color={colors.textMuted} align="center">
                  ลองพิมพ์ชื่ออังกฤษ เช่น Metformin
                </AppText>
                <Button
                  label={`เพิ่ม “${query.trim()}” เป็นยาใหม่`}
                  icon="plus"
                  variant="tint"
                  size="sm"
                  style={styles.notFoundAction}
                  onPress={() =>
                    router.push({ pathname: "/(tabs)/medications/new", params: { name: query.trim() } } as any)
                  }
                />
              </Card>
            </View>
          ) : (
            <View style={styles.item}>
              <EmptyCard title="ไม่มียาในกลุ่มนี้" actionLabel="ดูทั้งหมด" onAction={() => setFilter("all")} />
            </View>
          )
        }
      />

      <Fab label="เพิ่มยา" onPress={() => router.push("/(tabs)/medications/new" as any)} />
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
  tools: {
    gap: 12,
    paddingBottom: 14,
  },
  search: {
    marginHorizontal: 20,
  },
  chips: {
    gap: 7,
    paddingHorizontal: 20,
  },
  item: {
    paddingHorizontal: 20,
  },
  separator: {
    height: 10,
  },
  notFound: {
    alignItems: "center",
    gap: 3,
    paddingVertical: 18,
  },
  notFoundAction: {
    marginTop: 10,
  },
});
