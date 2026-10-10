import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { colors, radius } from "../constants/theme";
import { searchDrugs } from "../services/drugs";
import { DrugSearchResult } from "../types";
import AppText from "./ui/AppText";
import Hatch from "./ui/Hatch";
import TextField from "./ui/TextField";

/** หน่วงก่อนยิงค้นหา กันไม่ให้ยิง request ทุกตัวอักษรที่พิมพ์ */
const DEBOUNCE_MS = 300;

type DrugSearchInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** ผู้ใช้เลือกยาจากรายการ ส่งชื่อมาตรฐานและ id กลับไป */
  onSelectDrug: (drug: DrugSearchResult) => void;
  /** ผู้ใช้แก้ข้อความเองหลังเคยเลือกไว้ ต้องล้าง drugId ทิ้ง */
  onClearSelection: () => void;
  /** id ของยาที่เลือกไว้แล้ว null = ยังไม่ได้จับคู่กับฐานข้อมูล */
  selectedDrugId: string | null;
  selectedCategoryTh?: string | null;
  error?: string;
};

/**
 * ช่องชื่อยาที่ค้นจากฐานข้อมูลอ้างอิง (หน้า 06)
 *
 * ผู้ใช้ยังพิมพ์ชื่อเองได้ถ้าค้นไม่เจอ แต่จะขึ้นกล่องลายทางบอกชัดว่า
 * ยาที่ไม่อยู่ในฐานข้อมูลจะตรวจปฏิกิริยาให้ไม่ได้
 * ผู้ใช้จะได้ไม่เข้าใจผิดว่าระบบตรวจให้แล้วและปลอดภัย
 */
export default function DrugSearchInput({
  value,
  onChangeText,
  onSelectDrug,
  onClearSelection,
  selectedDrugId,
  selectedCategoryTh,
  error,
}: DrugSearchInputProps) {
  const [results, setResults] = useState<DrugSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // กันผลลัพธ์ของคำค้นเก่ามาทับของใหม่ เมื่อ request กลับมาไม่เรียงลำดับ
  const latestQuery = useRef("");

  const term = value.trim();
  // สั้นกว่า 2 ตัวอักษรผลลัพธ์จะกว้างเกินไป และเลือกยาไปแล้วก็ไม่ต้องค้นซ้ำ
  const shouldSearch = !selectedDrugId && term.length >= 2;

  useEffect(() => {
    latestQuery.current = term;

    if (!shouldSearch) {
      return;
    }

    // ตั้งสถานะกำลังค้นตอนที่ยิงคำขอจริง ไม่ใช่ตอนเริ่มเอฟเฟกต์
    const timer = setTimeout(async () => {
      setSearching(true);

      const found = await searchDrugs(term);

      // ผลของคำค้นเก่ามาช้ากว่า ทิ้งไปไม่ให้ทับผลของคำใหม่
      if (latestQuery.current !== term) {
        return;
      }

      setResults(found);
      setSearching(false);
      setShowResults(true);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, shouldSearch]);

  // คำนวณจากสถานะปัจจุบัน ล้างช่องค้นหาแล้วรายการเก่าหายทันที
  const visibleResults = shouldSearch ? results : [];
  const isSearching = shouldSearch && searching;
  const notFound = shouldSearch && !isSearching && showResults && visibleResults.length === 0;

  function handleChange(text: string) {
    if (selectedDrugId) {
      // แก้ข้อความหลังเลือกแล้ว = ไม่ใช่ยาตัวเดิมอีกต่อไป
      onClearSelection();
    }

    onChangeText(text);
  }

  function handleSelect(drug: DrugSearchResult) {
    onSelectDrug(drug);
    setResults([]);
    setShowResults(false);
  }

  const right = isSearching ? (
    <View style={styles.rightSlot}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  ) : selectedDrugId ? (
    <View style={styles.badge}>
      <AppText variant="meta" weight="semibold" color={colors.primaryText}>
        พบในฐานข้อมูล
      </AppText>
    </View>
  ) : null;

  return (
    <View style={styles.wrapper}>
      <TextField
        label="ชื่อยา"
        required
        value={value}
        onChangeText={handleChange}
        placeholder="พิมพ์ชื่อยา เช่น พารา หรือ Metformin"
        autoCapitalize="none"
        autoCorrect={false}
        error={error}
        strong={Boolean(selectedDrugId)}
        helper={
          selectedDrugId
            ? selectedCategoryTh ?? undefined
            : "พิมพ์แล้วเลือกจากรายการ ระบบจะตรวจกับยาที่กินอยู่ให้"
        }
        right={right}
      />

      {!selectedDrugId && visibleResults.length > 0 ? (
        <View style={styles.results} accessibilityRole="list">
          {visibleResults.map((drug, index) => {
            // ค้นเจอผ่านชื่อพ้อง ต้องบอกให้เห็นว่าคำที่พิมพ์ตรงกับยาตัวไหน
            const viaAlias = drug.matchedVia.toLowerCase() !== drug.nameEn.toLowerCase();

            return (
              <Pressable
                key={drug.id}
                onPress={() => handleSelect(drug)}
                accessibilityRole="button"
                accessibilityLabel={`เลือก ${drug.nameEn}${viaAlias ? ` ตรงกับ ${drug.matchedVia}` : ""}`}
                style={({ pressed }) => [styles.resultRow, index > 0 && styles.resultDivider, pressed && styles.resultPressed]}
              >
                <View style={styles.resultMain}>
                  <AppText variant="bodyStrong" weight="bold">
                    {drug.nameEn}
                  </AppText>
                  <AppText variant="meta" weight="regular" color={colors.textMuted} numberOfLines={1}>
                    {[viaAlias ? `ตรงกับ “${drug.matchedVia}”` : null, drug.categoryTh].filter(Boolean).join(" · ")}
                  </AppText>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.placeholder} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {notFound ? (
        <Hatch style={styles.notFound}>
          <AppText variant="small">
            <AppText variant="small" weight="bold">
              {`ไม่พบ “${term}” ในฐานข้อมูล`}
            </AppText>
            {" · บันทึกได้ แต่"}
            <AppText variant="small" weight="bold">
              ตรวจปฏิกิริยาให้ไม่ได้
            </AppText>
            {" ถามเภสัชกรเพิ่มนะคะ"}
          </AppText>
        </Hatch>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  rightSlot: {
    width: 40,
    alignItems: "center",
  },
  badge: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  results: {
    backgroundColor: colors.surface,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  resultDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  resultPressed: {
    backgroundColor: colors.tertiary,
  },
  resultMain: {
    flex: 1,
    minWidth: 0,
  },
  notFound: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
