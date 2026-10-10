-- สร้างอัตโนมัติโดย build_seed.py — อย่าแก้ไฟล์นี้ด้วยมือ
-- ที่มา: DDInter 2.0 (https://ddinter2.scbdd.com)
-- รันหลัง schema.sql และ migrate-01-ddinter.sql

begin;

delete from drug_drug_interactions;
delete from drug_food_interactions;
delete from drug_reference;

insert into drug_reference (name_en) values
  ('Acetaminophen'),
  ('Acetylsalicylic acid'),
  ('Alprazolam'),
  ('Amitriptyline'),
  ('Amlodipine'),
  ('Atenolol'),
  ('Atorvastatin'),
  ('Budesonide'),
  ('Caffeine'),
  ('Calcium carbonate'),
  ('Carbamazepine'),
  ('Cetirizine'),
  ('Chlorpheniramine'),
  ('Ciprofloxacin'),
  ('Codeine'),
  ('Dextromethorphan'),
  ('Diazepam'),
  ('Diclofenac'),
  ('Digoxin'),
  ('Diphenhydramine'),
  ('Doxycycline'),
  ('Enalapril'),
  ('Esomeprazole'),
  ('Fexofenadine'),
  ('Fluoxetine'),
  ('Folic acid'),
  ('Furosemide'),
  ('Gabapentin'),
  ('Glipizide'),
  ('Hydrochlorothiazide'),
  ('Hydroxyzine'),
  ('Ibuprofen'),
  ('Indomethacin'),
  ('Iron'),
  ('Isoniazid'),
  ('Levofloxacin'),
  ('Levonorgestrel'),
  ('Levothyroxine'),
  ('Lisinopril'),
  ('Loperamide'),
  ('Loratadine'),
  ('Lorazepam'),
  ('Losartan'),
  ('Mefenamic acid'),
  ('Melatonin'),
  ('Metformin'),
  ('Metoclopramide'),
  ('Metoprolol'),
  ('Metronidazole'),
  ('Morphine'),
  ('Naproxen'),
  ('Phenytoin'),
  ('Piroxicam'),
  ('Propranolol'),
  ('Rosuvastatin'),
  ('Sertraline'),
  ('Simvastatin'),
  ('Theophylline'),
  ('Tramadol'),
  ('Valproic acid'),
  ('Warfarin')
on conflict (name_en) do nothing;

commit;
