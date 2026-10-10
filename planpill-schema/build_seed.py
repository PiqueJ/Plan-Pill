#!/usr/bin/env python3
"""
สร้าง seed-ddinter.sql จากไฟล์ CSV ของ DDInter 2.0

วิธีใช้
    cd planpill-schema
    python build_seed.py

ต้องมีไฟล์ใน ddinter-raw/ ก่อน (ดูวิธีดาวน์โหลดใน README.md)
ผลลัพธ์คือ seed-ddinter.sql ที่นำไปวางใน Supabase SQL Editor แล้วกด Run

สิ่งที่สคริปต์นี้จัดการให้
  - แปลงชื่ออาหาร 29 ชื่อของ DDInter เป็นหมวดอาหาร 17 หมวดของระบบ
  - ตัดคำว่า "... More" ที่ DDInter ต่อท้ายข้อความที่ถูกตัด
  - เติมคำแปลไทยจากตาราง THAI_TEXTS เท่าที่มี ที่เหลือปล่อยเป็น null
  - รวมอาหารหลายชื่อที่อยู่หมวดเดียวกันให้เหลือแถวเดียว เลือกระดับรุนแรงสูงสุด
  - ทิ้งคู่ยาที่ระดับความรุนแรงเป็น Unknown (28% ของไฟล์ drug-drug)
  - จัดเรียงคู่ยาให้ drug_a < drug_b ตาม constraint ในตาราง
"""

import csv
import glob
import os
import re
from collections import Counter

RAW_DIR = "ddinter-raw"
# ผลลัพธ์แยกเป็น seed-01..03 ดูท้ายฟังก์ชัน main()

# จำนวนคู่ยาต่อไฟล์ แบ่งไฟล์เพื่อให้วางใน SQL Editor ได้โดยไม่ค้าง
#
# เดิมเคยตัดไว้แค่ 4,000 คู่แล้วเรียงตามชื่อยา ซึ่งผิดพลาด
# เพราะคู่ระดับ major มีถึง 6,738 คู่ การตัดที่ 4,000 จึงเก็บแต่ยาที่ขึ้นต้นด้วย A-C
# ทำให้ยาอย่าง Warfarin (244 คู่) แทบไม่เข้าระบบเลย ตอนนี้เอาเข้าครบทุกคู่
DDI_PAIRS_PER_FILE = 12000

SEVERITY = {"Major": "major", "Moderate": "moderate", "Minor": "minor"}

# ---------------------------------------------------------------------------
#  ยาที่คัดไว้สำหรับแอป
#
#  ชุดข้อมูล DDInter มียา 726 ตัว ซึ่งส่วนใหญ่เป็นยาเฉพาะทาง เช่น ยาเคมีบำบัด
#  ที่กลุ่มเป้าหมาย (นักศึกษาและวัยทำงาน) ไม่มีทางได้ใช้ การเอาเข้าทั้งหมด
#  ทำให้ผลค้นหารก แปลไทยไม่ไหว และไฟล์ SQL ใหญ่เกินกว่าจะวางใน SQL Editor
#
#  จึงคัดเหลือเฉพาะยาที่หาซื้อได้ในไทยหรือใช้รักษาโรคที่พบบ่อย
#  ชื่อที่ไม่มีในชุดข้อมูลจะถูกข้ามไปเองโดยอัตโนมัติ เพิ่มชื่อใหม่ได้ตลอด
# ---------------------------------------------------------------------------
CURATED_DRUGS = [
    # ยาแก้ปวด ลดไข้ ต้านการอักเสบ
    "Acetaminophen", "Acetylsalicylic acid", "Ibuprofen", "Naproxen",
    "Diclofenac", "Mefenamic acid", "Indomethacin", "Piroxicam",
    "Tramadol", "Codeine", "Morphine",
    # ยาแก้แพ้ และยาแก้หวัด
    "Cetirizine", "Loratadine", "Chlorpheniramine", "Fexofenadine",
    "Diphenhydramine", "Hydroxyzine", "Dextromethorphan",
    # ยาทางเดินอาหาร
    "Esomeprazole", "Loperamide", "Metoclopramide",
    # เบาหวาน ไขมัน ความดัน หัวใจ
    "Metformin", "Glipizide", "Simvastatin", "Atorvastatin", "Rosuvastatin",
    "Amlodipine", "Losartan", "Enalapril", "Lisinopril", "Atenolol",
    "Metoprolol", "Propranolol", "Hydrochlorothiazide", "Furosemide",
    "Warfarin", "Digoxin",
    # ฮอร์โมนและยาคุมกำเนิด
    "Levothyroxine", "Levonorgestrel",
    # ยาปฏิชีวนะและยาต้านเชื้อ
    "Doxycycline", "Ciprofloxacin", "Levofloxacin", "Metronidazole", "Isoniazid",
    # วิตามินและอาหารเสริม
    "Iron", "Calcium carbonate", "Folic acid", "Caffeine",
    # ระบบประสาทและจิตเวช
    "Amitriptyline", "Fluoxetine", "Sertraline", "Diazepam", "Lorazepam",
    "Alprazolam", "Phenytoin", "Carbamazepine", "Valproic acid",
    "Gabapentin", "Melatonin",
    # ระบบหายใจ
    "Theophylline", "Budesonide",
]



# ---------------------------------------------------------------------------
#  ชื่ออาหารใน DDInter -> หมวดอาหารของระบบ
#  ครอบคลุมครบทั้ง 29 ชื่อที่พบในไฟล์ Drug-Food Interaction.csv
# ---------------------------------------------------------------------------
FOOD_MAP = {
    "alcohol": "alcohol",
    "grapefruit juice": "grapefruit",
    "orange juice": "citrus",
    "citrus fruits": "citrus",
    "pomegranates": "citrus",
    "cranberry juice": "citrus",
    "dairy products": "dairy",
    "coffee": "caffeine",
    "green tea": "caffeine",
    "cola": "caffeine",
    "soft drinks": "caffeine",
    "high-fat foods": "high_fat",
    "bran": "high_fiber",
    "grain": "high_fiber",
    "cereal": "high_fiber",
    "dietary fiber": "high_fiber",
    "high-fiber meal": "high_fiber",
    "spinach": "oxalate",
    "rhubarb": "oxalate",
    "Food High in Potassium": "potassium",
    "food high in vitamin K": "vitamin_k",
    "Tyrosine-rich foods": "tyrosine",
    "soybean": "soy",
    "walnuts": "nuts_seeds",
    "cotton seed": "nuts_seeds",
    "Iodine-rich foods": "iodine",
    "foods containing photosensitizing components": "photosensitive",
    "food": "with_food",
    "cigarette": "smoking",
}

# ---------------------------------------------------------------------------
#  คำแปลไทยของข้อความที่ใช้ซ้ำบ่อยที่สุด
#
#  key คือ 60 ตัวอักษรแรกของ Description ต้นฉบับ (ตัดช่องว่างซ้ำแล้ว)
#  ครอบคลุมประมาณ 45% ของแถวทั้งหมด ที่เหลือแอปจะแสดงต้นฉบับภาษาอังกฤษแทน
#
#  หมายเหตุ: ต้นฉบับถูก DDInter ตัดที่ประมาณ 200 ตัวอักษร คำแปลจึงสรุปเท่าที่มี
#  ทีมเติมเพิ่มได้เรื่อย ๆ โดยไม่ต้องแก้ schema
# ---------------------------------------------------------------------------
THAI_TEXTS = {
    "Alcohol may potentiate some of the pharmacologic effects": (
        "แอลกอฮอล์อาจเสริมฤทธิ์ยาที่ออกฤทธิ์ต่อระบบประสาทส่วนกลาง "
        "ทำให้กดประสาทมากขึ้น มีผลต่อการตัดสินใจ ความคิด และการตอบสนอง",
        "ควรเลี่ยงหรือจำกัดการดื่มแอลกอฮอล์ระหว่างใช้ยานี้ "
        "และหลีกเลี่ยงการขับรถหรือทำงานกับเครื่องจักรจนกว่าจะรู้ว่ายาส่งผลต่อตนเองอย่างไร",
    ),
    "Many psychotherapeutic and CNS-active agents": (
        "ยาที่ออกฤทธิ์ต่อจิตประสาทและระบบประสาทส่วนกลางหลายชนิด เช่น ยาคลายกังวล "
        "ยานอนหลับ ยาต้านซึมเศร้า ยาแก้ปวดกลุ่มโอปิออยด์ และแอลกอฮอล์ "
        "มีฤทธิ์ลดความดันโลหิต โดยเฉพาะช่วงเริ่มใช้ยา",
        "ควรระวังและสังเกตอาการความดันโลหิตต่ำเมื่อใช้ร่วมกัน "
        "ผู้ที่ได้รับยาลดความดันบางกลุ่มควรเลี่ยงแอลกอฮอล์",
    ),
    "Alcohol may cause hypoglycemia or hyperglycemia": (
        "แอลกอฮอล์อาจทำให้น้ำตาลในเลือดต่ำหรือสูงผิดปกติในผู้ป่วยเบาหวาน "
        "ภาวะน้ำตาลต่ำมักเกิดขณะดื่ม แม้ปริมาณไม่มากก็ลดระดับน้ำตาลได้อย่างมีนัยสำคัญ",
        "ผู้ป่วยเบาหวานที่คุมน้ำตาลได้ไม่ดี หรือมีไขมันในเลือดสูง ปลายประสาทอักเสบ "
        "หรือตับอ่อนอักเสบ ควรงดแอลกอฮอล์",
    ),
    "The concurrent use of aspirin or nonsteroidal anti-inflam": (
        "การใช้แอสไพรินหรือยาแก้อักเสบที่ไม่ใช่สเตียรอยด์ (NSAIDs) ร่วมกับแอลกอฮอล์ "
        "อาจทำให้เลือดออกในทางเดินอาหาร",
        "ควรงดดื่มแอลกอฮอล์ขณะใช้แอสไพรินหรือยากลุ่ม NSAIDs",
    ),
    "Use of anticholinergic agents with alcohol": (
        "การใช้ยากลุ่มแอนติโคลิเนอร์จิกร่วมกับแอลกอฮอล์ อาจทำให้สมาธิลดลงมากพอ "
        "จนการขับรถและการใช้เครื่องจักรอันตรายขึ้น",
        "โดยทั่วไปควรเลี่ยงแอลกอฮอล์ระหว่างใช้ยากลุ่มนี้ "
        "และเลี่ยงกิจกรรมที่ต้องใช้ความตื่นตัวจนกว่าจะรู้ผลของยาต่อตนเอง",
    ),
    "Grapefruit juice may increase the plasma concentrations": (
        "น้ำเกรปฟรุตอาจเพิ่มระดับยาในเลือดสำหรับยาที่ถูกเปลี่ยนแปลงด้วยเอนไซม์ CYP450 3A4 "
        "เนื่องจากไปยับยั้งการทำลายยาในรอบแรกที่ผนังลำไส้",
        "ผู้ที่ดื่มน้ำเกรปฟรุตเป็นประจำควรเฝ้าระวังอาการข้างเคียงที่อาจรุนแรงขึ้น "
        "และควรปรึกษาเภสัชกรว่ายาที่ใช้อยู่ได้รับผลกระทบหรือไม่",
    ),
    "Administration with food may increase the absorption of c": (
        "การรับประทานพร้อมอาหารช่วยเพิ่มการดูดซึมแคลเซียม แต่อาหารที่มีกรดออกซาลิกสูง "
        "(ผักโขม รูบาร์บ) หรือกรดไฟติกสูง (รำข้าว ธัญพืชไม่ขัดสี) จะลดการดูดซึมแคลเซียม",
        "รับประทานแคลเซียมพร้อมอาหารเพื่อเพิ่มการดูดซึม "
        "และเว้นระยะห่างอย่างน้อย 2 ชั่วโมงจากอาหารที่มีกรดออกซาลิกหรือกรดไฟติกสูง",
    ),
    "Ethanol may potentiate the central nervous system (CNS) d": (
        "แอลกอฮอล์อาจเสริมฤทธิ์กดประสาทของยาแก้ปวดกลุ่มโอปิออยด์ "
        "ทำให้กดประสาทมากขึ้นและมีผลต่อการตัดสินใจและการเคลื่อนไหว",
        "ควรหลีกเลี่ยงการใช้ยาแก้ปวดกลุ่มโอปิออยด์ร่วมกับแอลกอฮอล์",
    ),
    "Moderate-to-high dietary intake of potassium": (
        "การรับประทานอาหารที่มีโพแทสเซียมสูง อาจทำให้โพแทสเซียมในเลือดสูงเกินไป "
        "ในผู้ที่ใช้ยากลุ่ม ACE inhibitor",
        "ผู้ที่ใช้ยากลุ่ม ACE inhibitor ควรเลี่ยงอาหารที่มีโพแทสเซียมสูง "
        "และระวังเกลือแกงชนิดที่ใช้โพแทสเซียมแทนโซเดียมเป็นพิเศษ",
    ),
    "Concomitant use of ethanol and a tricyclic antidepressant": (
        "การใช้แอลกอฮอล์ร่วมกับยาต้านซึมเศร้ากลุ่มไตรไซคลิก อาจทำให้ระดับยาเปลี่ยนไป "
        "และทำให้ทักษะการเคลื่อนไหวโดยเฉพาะการขับรถแย่ลง",
        "ควรเลี่ยงแอลกอฮอล์ตลอดช่วงที่ใช้ยากลุ่มนี้",
    ),
    "Concurrent acute use of barbiturates and ethanol": (
        "การใช้ยากลุ่มบาร์บิทูเรตร่วมกับแอลกอฮอล์ อาจเสริมฤทธิ์กดประสาท "
        "ทำให้การประสานงานของร่างกายเสียไป ง่วงซึม และรุนแรงถึงชีวิตได้",
        "ห้ามใช้ยากลุ่มบาร์บิทูเรตร่วมกับแอลกอฮอล์",
    ),
    # ----- คู่ที่จะใช้สาธิตตอนนำเสนอ แปลไว้ให้ครบ -----
    "Chronic, excessive consumption of alcohol may increase th": (
        "การดื่มแอลกอฮอล์ปริมาณมากเป็นประจำ เพิ่มความเสี่ยงที่พาราเซตามอล "
        "(acetaminophen) จะทำให้ตับเป็นพิษ ซึ่งมีรายงานถึงขั้นตับวายแม้พบไม่บ่อย",
        "ผู้ที่ดื่มแอลกอฮอล์เป็นประจำควรเลี่ยงการใช้พาราเซตามอลต่อเนื่องหรือในขนาดสูง "
        "ผู้ที่ดื่มตั้งแต่ 3 แก้วต่อวันขึ้นไปควรปรึกษาแพทย์เพื่อเลือกยาแก้ปวดชนิดอื่น",
    ),
    "Coadministration with grapefruit juice may significantly": (
        "น้ำเกรปฟรุตอาจเพิ่มระดับยา simvastatin และ lovastatin ในเลือดอย่างมีนัยสำคัญ "
        "โดยไปยับยั้งเอนไซม์ CYP450 3A4 ที่ผนังลำไส้ ทำให้เสี่ยงต่อผลข้างเคียงต่อกล้ามเนื้อมากขึ้น",
        "ผู้ที่ใช้ simvastatin หรือ lovastatin ควรเลี่ยงเกรปฟรุตและน้ำเกรปฟรุต "
        "ส่วนยากลุ่มสแตตินตัวอื่น เช่น fluvastatin, pravastatin ได้รับผลกระทบน้อยกว่า",
    ),
    "Vitamin K may antagonize the hypoprothrombinemic effect": (
        "วิตามินเคต้านฤทธิ์ของยาต้านการแข็งตัวของเลือดชนิดรับประทาน เพราะเป็นสารตั้งต้น "
        "ในการสร้างปัจจัยการแข็งตัวของเลือดที่ยากลุ่มนี้ไปยับยั้งไว้",
        "ไม่จำเป็นต้องงดผักใบเขียว แต่ควรกินให้ปริมาณสม่ำเสมอในแต่ละวัน "
        "การกินมากบ้างน้อยบ้างจะทำให้ผลของยาแกว่ง ควรแจ้งแพทย์หากเปลี่ยนรูปแบบการกินอาหาร",
    ),
    "Consumption of certain foods as well as the timing of mea": (
        "อาหารบางชนิดและช่วงเวลาที่กินเทียบกับเวลากินยา มีผลต่อการดูดซึมฮอร์โมนไทรอยด์ "
        "(levothyroxine) การกินขณะท้องว่างช่วยให้ดูดซึมดีขึ้น ส่วนถั่วเหลืองและอาหารกากใยสูงจะลดการดูดซึม",
        "ควรกินยาไทรอยด์เวลาเดิมทุกวันและสัมพันธ์กับมื้ออาหารแบบเดิมเสมอ "
        "เพื่อไม่ให้ระดับยาในเลือดแกว่ง โดยทั่วไปแนะนำให้กินขณะท้องว่าง",
    ),
    "Alcohol can potentiate the effect of metformin on lactate": (
        "แอลกอฮอล์เสริมผลของ metformin ต่อการเผาผลาญแลกเทต เพิ่มความเสี่ยงภาวะเลือดเป็นกรด "
        "จากแลกเทต และยังทำให้น้ำตาลในเลือดผิดปกติได้ด้วย",
        "ควรกิน metformin พร้อมมื้ออาหาร และเลี่ยงการดื่มแอลกอฮอล์ปริมาณมากตลอดช่วงที่ใช้ยา",
    ),
    # ----- คู่ที่เหลือของชุดยาที่คัดไว้ แปลจนครบทุกชุด -----
    "Concomitant use of some food may reduce the bioavailabil": (
        "อาหารบางชนิดลดการดูดซึมธาตุเหล็กชนิดรับประทาน และธาตุเหล็กเองก็ลดการดูดซึมสารอาหารบางอย่างเช่นกัน",
        "ควรกินธาตุเหล็กตอนท้องว่าง คือก่อนอาหาร 1 ชั่วโมง หรือหลังอาหาร 2 ชั่วโมง "
        "ถ้าทำไม่ได้ให้กินพร้อมอาหารแล้วสังเกตอาการอย่างใกล้ชิด",
    ),
    "Food may interfere with the absorption of esomeprazole. ": (
        "อาหารรบกวนการดูดซึมยา esomeprazole โดยระดับยาในเลือดลดลงประมาณ 33-53% เมื่อกินพร้อมอาหาร",
        "ควรกิน esomeprazole ก่อนอาหารอย่างน้อย 1 ชั่วโมง",
    ),
    "Food may reduce the oral absorption and bioavailability ": (
        "อาหารลดการดูดซึมยา levofloxacin ทำให้ยาออกฤทธิ์ช้าลงและระดับยาในเลือดต่ำลง",
        "ควรกินก่อนอาหารอย่างน้อย 1 ชั่วโมง หรือหลังอาหาร 2 ชั่วโมง เพื่อให้ดูดซึมได้เต็มที่และสม่ำเสมอ",
    ),
    "Concomitant use of statin medication with substantial qu": (
        "การใช้ยากลุ่มสแตตินร่วมกับแอลกอฮอล์ปริมาณมาก เพิ่มความเสี่ยงต่อการบาดเจ็บของตับ "
        "มีรายงานค่าเอนไซม์ตับสูงขึ้นชั่วคราวจากการใช้ยากลุ่มนี้",
        "ควรเลี่ยงการดื่มแอลกอฮอล์ปริมาณมากขณะใช้ยากลุ่มสแตติน",
    ),
    "Orange juice may moderately reduce the bioavailability o": (
        "น้ำส้มลดการดูดซึมยา atenolol จากทางเดินอาหาร ทำให้ระดับยาในเลือดลดลงพอสมควร",
        "ควรกิน atenolol เวลาเดิมทุกวัน และเลี่ยงการดื่มน้ำส้มปริมาณมาก เพื่อไม่ให้ระดับยาแกว่ง",
    ),
    "The consumption of grapefruit juice may slightly increas": (
        "น้ำเกรปฟรุตอาจเพิ่มระดับยา amlodipine ในเลือดเล็กน้อย โดยยับยั้งเอนไซม์ CYP450 3A4 ที่ผนังลำไส้",
        "โดยทั่วไปควรเลี่ยงการกิน amlodipine ร่วมกับเกรปฟรุตหรือน้ำเกรปฟรุต",
    ),
    "Alcohol may potentiate the central nervous system (CNS) ": (
        "แอลกอฮอล์เสริมฤทธิ์กดประสาทของยาแก้ปวดกลุ่มโอปิออยด์รวมถึงมอร์ฟีน "
        "ทำให้กดประสาทมากขึ้นและมีผลต่อการตัดสินใจ",
        "ผู้ที่ใช้มอร์ฟีนชนิดออกฤทธิ์เนิ่น ไม่ควรดื่มแอลกอฮอล์หรือใช้ยาที่มีแอลกอฮอล์ผสมอยู่",
    ),
    "Enhanced hypoprothrombinemic response to warfarin has be": (
        "การดื่มแอลกอฮอล์มากเฉียบพลัน หรือมีโรคตับร่วมด้วย อาจเสริมฤทธิ์ยา warfarin ทำให้เลือดออกง่ายขึ้น",
        "ควรเลี่ยงการดื่มแอลกอฮอล์ปริมาณมาก การดื่มพอประมาณ (1-2 แก้วต่อวัน) มักไม่กระทบผลของยา",
    ),
    "The bioavailability of metoprolol may be enhanced by foo": (
        "อาหารช่วยเพิ่มการดูดซึมยา metoprolol",
        "ควรกิน metoprolol เวลาเดิมทุกวัน โดยกินพร้อมอาหารหรือทันทีหลังอาหาร",
    ),
    "Coadministration with caffeine may increase the serum co": (
        "คาเฟอีนอาจเพิ่มระดับยา theophylline ในเลือด เพราะแย่งใช้เอนไซม์ CYP450 1A2 ตัวเดียวกันในการกำจัดยา",
        "ควรจำกัดคาเฟอีนขณะใช้ยา theophylline และสังเกตอาการข้างเคียง เช่น ใจสั่น นอนไม่หลับ",
    ),
    "The central nervous system effects and blood levels of e": (
        "ผู้ที่ใช้ยาคุมกำเนิดชนิดรับประทาน อาจมีระดับแอลกอฮอล์ในเลือดและผลต่อระบบประสาทสูงขึ้น "
        "แต่ข้อมูลยังมีจำกัดและรายงานขัดแย้งกัน",
        "ผลที่เกิดขึ้นคาดเดาได้ยาก ควรระมัดระวังเป็นพิเศษเมื่อดื่มแอลกอฮอล์",
    ),
    "The bioavailability of propranolol may be enhanced by fo": (
        "อาหารช่วยเพิ่มการดูดซึมยา propranolol",
        "ควรกิน propranolol เวลาเดิมทุกวัน โดยกินพร้อมอาหารหรือทันทีหลังอาหาร",
    ),
    "Theoretically, grapefruit juice may increase the plasma ": (
        "ในทางทฤษฎี น้ำเกรปฟรุตอาจเพิ่มระดับยา loratadine ในเลือด เพราะยานี้ถูกกำจัดผ่านเอนไซม์ CYP450 3A4",
        "ผลทางคลินิกยังไม่ชัดเจน หากดื่มเป็นประจำควรสังเกตอาการง่วงหรือใจสั่นที่มากกว่าปกติ",
    ),
    "Oral caffeine may significantly increase the bioavailabi": (
        "คาเฟอีนชนิดรับประทานอาจเพิ่มระดับเมลาโทนินในเลือดอย่างมีนัยสำคัญ",
        "หากใช้เมลาโทนินเพื่อช่วยการนอน ควรเลี่ยงคาเฟอีนตั้งแต่ช่วงเย็นจนถึงก่อนนอน",
    ),
    "Administration of digoxin with a high-fiber meal has bee": (
        "การกิน digoxin พร้อมอาหารกากใยสูง ลดการดูดซึมยาลงเกือบ 20% เพราะกากใยจับตัวยาไว้ได้ถึง 45%",
        "ควรกินอาหารกากใยในปริมาณสม่ำเสมอ ไม่มากบ้างน้อยบ้าง โดยเฉพาะช่วงที่กำลังปรับขนาดยา",
    ),
    "Chronic alcohol consumption may enhance the elimination ": (
        "การดื่มแอลกอฮอล์เป็นประจำเร่งการกำจัดยา doxycycline ออกจากร่างกาย ทำให้ระดับยาลดลง",
        "ผู้ที่ดื่มเป็นประจำอาจต้องปรับขนาดยา ควรปรึกษาแพทย์ "
        "ยากลุ่มเตตราไซคลินตัวอื่นมักไม่ได้รับผลกระทบ",
    ),
    "Concurrent ingestion of dairy products (milk, yogurt) or": (
        "นมและผลิตภัณฑ์จากนม รวมถึงอาหารเสริมแคลเซียม ลดฤทธิ์ยาปฏิชีวนะกลุ่มฟลูออโรควิโนโลน "
        "เพราะแคลเซียมจับกับตัวยาทำให้ดูดซึมได้น้อยลง",
        "ไม่ควรกิน ciprofloxacin พร้อมนมหรืออาหารเสริมแคลเซียมเพียงอย่างเดียว "
        "แต่กินพร้อมมื้ออาหารที่มีนมผสมอยู่ได้",
    ),
    "The effect of grapefruit juice on the pharmacologic acti": (
        "ผลของน้ำเกรปฟรุตต่อฤทธิ์ของคาเฟอีนยังไม่แน่ชัด มีรายงานว่าอาจเสริมฤทธิ์คาเฟอีน",
        "ความสำคัญทางคลินิกยังไม่ทราบแน่ชัด",
    ),
    "Phenytoin bioavailability may decrease to subtherapeutic": (
        "อาหาร โดยเฉพาะอาหารทางสายยาง อาจลดการดูดซึมยา phenytoin จนต่ำกว่าระดับที่ใช้รักษาได้",
        "ควรเว้นระยะห่างจากมื้ออาหาร 2 ชั่วโมงก่อนและหลังกินยา "
        "และกินยาให้สัมพันธ์กับมื้ออาหารแบบเดิมทุกวัน",
    ),
    "Alcoholic patients have been shown to have a higher inci": (
        "ผู้ที่ดื่มแอลกอฮอล์เป็นประจำ มีโอกาสเกิดพิษต่อตับจากยา isoniazid สูงกว่าคนทั่วไป",
        "ควรงดแอลกอฮอล์ตลอดช่วงที่ใช้ยา isoniazid",
    ),
    "Administration with food significantly reduces isoniazid": (
        "อาหารลดการดูดซึมยา isoniazid อย่างมีนัยสำคัญ เพิ่มความเสี่ยงที่การรักษาจะล้มเหลวหรือเชื้อดื้อยา",
        "ควรกิน isoniazid ตอนท้องว่าง คือก่อนอาหาร 1 ชั่วโมง หรือหลังอาหาร 2 ชั่วโมง",
    ),
    "Coadministration with large amounts of certain fruit jui": (
        "น้ำผลไม้ปริมาณมาก โดยเฉพาะน้ำเกรปฟรุต น้ำส้ม และน้ำแอปเปิล ลดการดูดซึมยา fexofenadine",
        "ควรกิน fexofenadine กับน้ำเปล่า และเลี่ยงการดื่มน้ำผลไม้เหล่านี้ปริมาณมาก",
    ),
    "Coadministration with grapefruit juice may increase the ": (
        "น้ำเกรปฟรุตอาจเพิ่มระดับยา atorvastatin ในเลือด โดยยับยั้งเอนไซม์ CYP450 3A4 ที่ผนังลำไส้",
        "จำกัดน้ำเกรปฟรุตไม่เกิน 1 ลิตรต่อวัน และรีบแจ้งแพทย์หากมีอาการปวดกล้ามเนื้อโดยไม่ทราบสาเหตุ",
    ),
    "Acute alcohol ingestion may potentiate the CNS depressio": (
        "การดื่มแอลกอฮอล์เสริมฤทธิ์กดประสาทของยากลุ่มเบนโซไดอะซีปีน",
        "ควรงดแอลกอฮอล์ตลอดช่วงที่ใช้ยากลุ่มนี้",
    ),
    "Limited clinical data suggest that consumption of grapef": (
        "ข้อมูลทางคลินิกที่มีอยู่บ่งชี้ว่า น้ำเกรปฟรุตอาจเพิ่มระดับยา sertraline ในเลือด",
        "ควรเลี่ยงหรือจำกัดน้ำเกรปฟรุต "
        "และเลี่ยงกิจกรรมที่ต้องใช้ความตื่นตัวจนกว่าจะรู้ผลของยาต่อตนเอง",
    ),
    "Ethanol may increase folic acid elimination and folic ac": (
        "แอลกอฮอล์เร่งการขับโฟลิกออกจากร่างกายและลดการดูดซึม การดื่มมากอาจทำให้ขาดโฟเลต",
        "ผู้ที่ดื่มแอลกอฮอล์เป็นประจำและกินโฟลิกเสริม ควรติดตามผลกับแพทย์",
    ),
    "Use of alcohol or products containing alcohol during nit": (
        "การดื่มแอลกอฮอล์ขณะใช้ยากลุ่มไนโตรอิมิดาโซล อาจเกิดปฏิกิริยาคล้ายยา disulfiram "
        "เช่น หน้าแดง ใจสั่น คลื่นไส้ อาเจียน",
        "ควรงดแอลกอฮอล์ตลอดช่วงที่ใช้ยา และงดต่ออีกอย่างน้อย 3 วันหลังหยุดยา",
    ),
    "The pharmacologic activity of oral midazolam, triazolam,": (
        "น้ำเกรปฟรุตอาจเพิ่มระดับยากลุ่มเบนโซไดอะซีปีนบางตัวในเลือด โดยยับยั้งเอนไซม์ CYP450 3A4",
        "ควรเลี่ยงเกรปฟรุตและน้ำเกรปฟรุตขณะใช้ยากลุ่มนี้",
    ),
}


def clean(text: str) -> str:
    """ตัด '... More' ที่ DDInter ต่อท้ายข้อความที่ถูกตัด และรวมช่องว่างซ้ำ"""
    text = re.sub(r"\s*\.\.\.\s*More\s*$", "…", text.strip())
    return re.sub(r"\s+", " ", text)


def thai_for(description: str):
    """หาคำแปลไทยจาก 60 ตัวอักษรแรกของต้นฉบับ"""
    key = re.sub(r"\s+", " ", description.strip())[:56]
    for prefix, value in THAI_TEXTS.items():
        if key.startswith(prefix[:56]):
            return value
    return (None, None)


def sql_str(value) -> str:
    if value is None or value == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_sql(filename: str, lines: list) -> None:
    with open(filename, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")

    print(f"   เขียน {filename} ({os.path.getsize(filename) // 1024} KB)")


def main() -> int:
    dfi_path = os.path.join(RAW_DIR, "Drug-Food Interaction.csv")

    if not os.path.exists(dfi_path):
        print(f"ไม่พบ {dfi_path} — ดูวิธีดาวน์โหลดใน README.md")
        return 1

    dfi_rows = read_csv(dfi_path)
    ddi_rows = []
    for path in sorted(glob.glob(os.path.join(RAW_DIR, "ddinter_downloads_code_*.csv"))):
        ddi_rows += read_csv(path)

    print(f"อ่านข้อมูล: drug-food {len(dfi_rows)} แถว, drug-drug {len(ddi_rows)} แถว")

    # ---------- ยาอ้างอิง: คัดเฉพาะยาที่กลุ่มเป้าหมายใช้จริง ----------
    curated = set(CURATED_DRUGS)
    available = {r["Drug name"].strip() for r in dfi_rows if r["Drug name"].strip()}

    drugs = sorted(curated & available)
    missing = sorted(curated - available)

    print(f"ยาอ้างอิง: {len(drugs)} จาก {len(available)} ตัวในชุดข้อมูล")

    if missing:
        print(f"   ไม่มีในชุดข้อมูล จึงข้ามไป: {', '.join(missing)}")

    # ตัดแถวที่ไม่เกี่ยวกับยาที่คัดไว้ออกตั้งแต่ต้น
    dfi_rows = [r for r in dfi_rows if r["Drug name"].strip() in drugs]

    # ---------- drug-food: รวมอาหารหลายชื่อในหมวดเดียวกัน เลือกระดับรุนแรงสูงสุด ----------
    rank = {"major": 3, "moderate": 2, "minor": 1}
    dfi_best = {}
    unmapped = set()

    for row in dfi_rows:
        food_code = FOOD_MAP.get(row["Food name"].strip())
        severity = SEVERITY.get(row["Severity level"].strip())

        if not food_code:
            unmapped.add(row["Food name"])
            continue
        if not severity:
            continue

        key = (row["Drug name"].strip(), food_code)
        current = dfi_best.get(key)

        if current is None or rank[severity] > rank[current["severity"]]:
            th_mech, th_mgmt = thai_for(row["Description"])
            dfi_best[key] = {
                "severity": severity,
                "description_en": clean(row["Description"]),
                "management_en": clean(row["Management"]),
                "mechanism_type": row["Mechanism"].strip(),
                "food_name_en": row["Food name"].strip(),
                "mechanism_th": th_mech,
                "management_th": th_mgmt,
            }

    if unmapped:
        print(f"!! ชื่ออาหารที่ยังไม่ได้ map: {sorted(unmapped)}")

    translated = sum(1 for v in dfi_best.values() if v["mechanism_th"])
    print(
        f"drug-food หลังรวมหมวด: {len(dfi_best)} แถว "
        f"(แปลไทยแล้ว {translated} = {translated * 100 // max(len(dfi_best), 1)}%)"
    )

    # ---------- drug-drug: ตัด Unknown, เอาเฉพาะยาที่อยู่ในตารางอ้างอิง ----------
    drug_set = set(drugs)
    ddi_best = {}

    for row in ddi_rows:
        a, b = row["Drug_A"].strip(), row["Drug_B"].strip()
        severity = SEVERITY.get(row["Level"].strip())

        if not severity or a == b or a not in drug_set or b not in drug_set:
            continue

        key = tuple(sorted([a, b]))
        current = ddi_best.get(key)

        if current is None or rank[severity] > rank[current]:
            ddi_best[key] = severity

    # เรียงตามความรุนแรงเพื่อให้อ่านไฟล์แล้วเห็นคู่สำคัญก่อน แต่เก็บครบทุกคู่
    ordered = sorted(
        ddi_best.items(), key=lambda kv: (-rank[kv[1]], kv[0][0], kv[0][1])
    )
    by_level = Counter(level for _, level in ordered)
    print(
        f"drug-drug ที่ใช้ได้: {len(ordered)} คู่ "
        f"(major {by_level['major']}, moderate {by_level['moderate']}, minor {by_level['minor']})"
    )

    # ---------- เขียนไฟล์ SQL (แยก 3 ไฟล์ให้รันทีละขั้น) ----------
    header = (
        "-- สร้างอัตโนมัติโดย build_seed.py — อย่าแก้ไฟล์นี้ด้วยมือ\n"
        "-- ที่มา: DDInter 2.0 (https://ddinter2.scbdd.com)\n"
        "-- รันหลัง schema.sql และ migrate-01-ddinter.sql\n"
    )

    # ไฟล์ที่ 1: รายชื่อยา
    part1 = [header, "begin;", ""]
    part1.append("delete from drug_drug_interactions;")
    part1.append("delete from drug_food_interactions;")
    part1.append("delete from drug_reference;")
    part1.append("")
    part1.append("insert into drug_reference (name_en) values")
    part1.append(
        ",\n".join(f"  ({sql_str(name)})" for name in drugs)
        + "\non conflict (name_en) do nothing;"
    )
    part1.append("")
    part1.append("commit;")
    write_sql("seed-01-drugs.sql", part1)

    # ไฟล์ที่ 2: ปฏิกิริยา ยา-อาหาร
    out = [header, "begin;", ""]

    # ใช้ insert ... select join แทน subquery ต่อแถว ไฟล์จะเล็กลงมากและ import เร็วกว่า
    out.append("insert into drug_food_interactions")
    out.append(
        "  (drug_id, food_code, severity, mechanism_th, management_th,"
    )
    out.append(
        "   description_en, management_en, mechanism_type, food_name_en, source_note)"
    )
    out.append(
        "select d.id, v.food_code, v.severity::severity_level, v.mechanism_th, v.management_th,"
    )
    out.append(
        "       v.description_en, v.management_en, v.mechanism_type, v.food_name_en, 'DDInter 2.0'"
    )
    out.append("from (values")
    values = []
    for (drug, food_code), item in sorted(dfi_best.items()):
        values.append(
            f"  ({sql_str(drug)},{sql_str(food_code)},'{item['severity']}',"
            f"{sql_str(item['mechanism_th'])},{sql_str(item['management_th'])},"
            f"{sql_str(item['description_en'])},{sql_str(item['management_en'])},"
            f"{sql_str(item['mechanism_type'])},{sql_str(item['food_name_en'])})"
        )
    out.append(",\n".join(values))
    out.append(
        ") as v(drug_name, food_code, severity, mechanism_th, management_th,"
    )
    out.append(
        "       description_en, management_en, mechanism_type, food_name_en)"
    )
    out.append("join drug_reference d on d.name_en = v.drug_name")
    out.append("on conflict (drug_id, food_code) do nothing;")
    out.append("")
    out.append("commit;")
    write_sql("seed-02-drug-food.sql", out)

    # ไฟล์ที่ 3 เป็นต้นไป: ปฏิกิริยา ยา-ยา แบ่งเป็นหลายไฟล์
    total_parts = (len(ordered) + DDI_PAIRS_PER_FILE - 1) // DDI_PAIRS_PER_FILE
    ddi_files = []

    for part in range(total_parts):
        chunk = ordered[part * DDI_PAIRS_PER_FILE : (part + 1) * DDI_PAIRS_PER_FILE]

        out = [
            header,
            f"-- ส่วนที่ {part + 1} จาก {total_parts} ({len(chunk)} คู่)",
            "",
            "begin;",
            "",
            "insert into drug_drug_interactions (drug_a_id, drug_b_id, severity, source_note)",
            # ตารางบังคับ drug_a_id < drug_b_id จึงเรียงด้วย least/greatest ตอน insert
            "select least(a.id, b.id), greatest(a.id, b.id), v.severity::severity_level, 'DDInter 2.0'",
            "from (values",
        ]
        out.append(
            ",\n".join(
                f"  ({sql_str(a)},{sql_str(b)},'{severity}')"
                for (a, b), severity in chunk
            )
        )
        out.append(") as v(a_name, b_name, severity)")
        out.append("join drug_reference a on a.name_en = v.a_name")
        out.append("join drug_reference b on b.name_en = v.b_name")
        out.append("on conflict (drug_a_id, drug_b_id) do nothing;")
        out.append("")
        out.append("commit;")

        filename = f"seed-03-drug-drug-{part + 1}.sql"
        write_sql(filename, out)
        ddi_files.append(filename)

    print("\nขั้นตอนต่อไป: เปิด Supabase SQL Editor แล้วรันตามลำดับ")
    print("   1. migrate-01-ddinter.sql")
    print("   2. seed-01-drugs.sql")
    print("   3. seed-02-drug-food.sql")
    for i, filename in enumerate(ddi_files, start=4):
        print(f"   {i}. {filename}")
    print(f"   {len(ddi_files) + 4}. seed-04-aliases.sql")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
