import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { colors } from "../constants/theme";
import { chooseOption, showMessage } from "../services/dialog";
import { PhotoSource, PickedPhoto, pickMealPhoto } from "../services/photos";
import AppText from "./ui/AppText";
import Hatch from "./ui/Hatch";

type MealPhotoFieldProps = {
  /**
   * รูปที่แสดงอยู่ตอนนี้
   *
   * เป็นได้ทั้ง path ในเครื่องของรูปที่เพิ่งเลือก และ signed URL ของรูปที่อัปโหลดแล้ว
   */
  previewUri: string | null;
  onPick: (photo: PickedPhoto) => void;
  onRemove: () => void;
  disabled?: boolean;
};

const SIZE = 96;

/**
 * ช่องรูปอาหาร 96×96 (หน้า 08) แตะเพื่อถ่ายหรือเลือกรูป
 *
 * รูปเป็นตัวเลือกเสริมเสมอ การตรวจปฏิกิริยาใช้หมวดอาหารที่ติ๊ก ไม่ได้ใช้รูป
 * บังคับถ่ายรูปจะทำให้คนเลิกบันทึกมื้อ
 */
export default function MealPhotoField({ previewUri, onPick, onRemove, disabled = false }: MealPhotoFieldProps) {
  const [picking, setPicking] = useState(false);

  async function pick(source: PhotoSource) {
    setPicking(true);

    try {
      const photo = await pickMealPhoto(source);

      // null = ผู้ใช้กดยกเลิก ไม่ต้องแจ้งอะไร
      if (photo) {
        onPick(photo);
      }
    } catch (error) {
      showMessage("เพิ่มรูปไม่สำเร็จ", error instanceof Error ? error.message : "ลองอีกครั้ง หรือบันทึกมื้อโดยไม่มีรูปก็ได้");
    } finally {
      setPicking(false);
    }
  }

  function openMenu() {
    chooseOption({
      title: previewUri ? "รูปของมื้อนี้" : "เพิ่มรูปอาหาร",
      choices: [
        { label: previewUri ? "ถ่ายใหม่" : "ถ่ายรูป", onPress: () => pick("camera") },
        { label: previewUri ? "เลือกรูปอื่น" : "เลือกจากคลังรูป", onPress: () => pick("library") },
        ...(previewUri ? [{ label: "เอารูปออก", onPress: onRemove }] : []),
      ],
    });
  }

  return (
    <Pressable
      onPress={openMenu}
      disabled={disabled || picking}
      accessibilityRole="button"
      accessibilityLabel={previewUri ? "รูปอาหาร แตะเพื่อเปลี่ยนหรือเอาออก" : "เพิ่มรูปอาหาร ไม่บังคับ"}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.image} contentFit="cover" transition={150} />
      ) : (
        <Hatch style={styles.empty}>
          <MaterialCommunityIcons name="camera-plus-outline" size={22} color={colors.textMuted} />
          <AppText variant="tiny" weight="regular" color={colors.textMuted} align="center">
            {"แตะเพื่อ\nถ่ายรูป"}
          </AppText>
        </Hatch>
      )}
      {picking ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: SIZE,
    height: SIZE,
    borderRadius: 20,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.8,
  },
  image: {
    width: SIZE,
    height: SIZE,
  },
  empty: {
    width: SIZE,
    height: SIZE,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderColor: colors.dashed,
  },
  busy: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
