-- Local development data for the fictional SupplyMate Wholesale demo.
-- Run only through `supabase db reset`; no real customer or payment data.

-- Demo users. The token columns must be non-null strings for GoTrue logins.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'admin@example.com', crypt('password123', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"ผู้ดูแล SupplyMate"}', now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'customer@example.com', crypt('password123', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"ร้านกาแฟตัวอย่าง"}', now(), now(),
   '', '', '', '')
on conflict (id) do nothing;

update public.profiles
set role = 'admin', full_name = 'ผู้ดูแล SupplyMate'
where id = '11111111-1111-1111-1111-111111111111';

update public.profiles
set full_name = 'ร้านกาแฟตัวอย่าง'
where id = '22222222-2222-2222-2222-222222222222';

-- BEGIN generated catalogue -- npm run generate:catalogue -- do not edit by hand
insert into public.categories (id, slug, name, description, image_path, sort_order) values
  ('a1000000-0000-0000-0000-000000000001', 'cups-lids', 'แก้วและฝา',
   'แก้ว ฝา และอุปกรณ์สำหรับเครื่องดื่มเย็น', '/images/supplymate/cups-lids.png', 1),
  ('a1000000-0000-0000-0000-000000000002', 'food-containers', 'กล่องอาหาร',
   'กล่องและถ้วยสำหรับอาหารเดลิเวอรี', '/images/supplymate/food-containers.png', 2),
  ('a1000000-0000-0000-0000-000000000003', 'paper-bags', 'ถุงกระดาษ',
   'ถุงกระดาษสำหรับร้านอาหารและเบเกอรี', '/images/supplymate/paper-bags.png', 3),
  ('a1000000-0000-0000-0000-000000000004', 'labels', 'ฉลากและสติกเกอร์',
   'ฉลากม้วนและสติกเกอร์สำหรับงานหน้าร้าน', '/images/supplymate/labels.png', 4),
  ('a1000000-0000-0000-0000-000000000005', 'bar-tools', 'อุปกรณ์บาร์',
   'อุปกรณ์ชงและเสิร์ฟเครื่องดื่มสำหรับร้านค้า', '/images/supplymate/bar-tools.png', 5),
  ('a1000000-0000-0000-0000-000000000006', 'eco-packaging', 'บรรจุภัณฑ์รักษ์โลก',
   'บรรจุภัณฑ์ทางเลือกสำหรับลดพลาสติกใช้ครั้งเดียว', '/images/supplymate/eco-packaging.png', 6)
on conflict (id) do nothing;

-- Prices are per package. Every item has local owned imagery, available
-- stock, an explicit pack size, and a database-enforced order minimum.
-- status is written explicitly; is_active is derived by
-- trg_products_sync_is_active and must never be written here.
insert into public.products (
  id, category_id, slug, name, description, price, sku, stock_quantity,
  has_variants, status, sort_order, package_unit, units_per_package, min_order_quantity
) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'clear-cup-16oz', 'แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม',
   'แก้ว PET ใสพร้อมฝาโดมสำหรับกาแฟเย็นและเครื่องดื่มปั่น',
   1650.00, 'SM-CUP-16-DOME', 42, false, 'active', 1,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
   'pet-cup-22oz', 'แก้ว PET ใส 22 ออนซ์',
   'แก้วใสทรงสูงสำหรับชาเย็นและเครื่องดื่มขนาดใหญ่',
   1780.00, 'SM-CUP-22', 31, false, 'active', 2,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000001',
   'hot-cup-8oz', 'แก้วกระดาษร้อน 8 ออนซ์',
   'แก้วกระดาษเคลือบสำหรับกาแฟร้อนและชาร้อน',
   1240.00, 'SM-CUP-H8', 47, false, 'active', 3,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
   'black-flat-lid-95mm', 'ฝาเรียบสีดำ 95 มม.',
   'ฝาปิดแก้วทรงเรียบพร้อมช่องเสียบหลอด',
   720.00, 'SM-LID-95-BLK', 58, false, 'active', 4,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000001',
   'dome-lid-95mm', 'ฝาโดมใส 95 มม.',
   'ฝาโดมใสสำหรับเครื่องดื่มปั่นและเมนูท็อปปิงสูง',
   780.00, 'SM-LID-95-DOME', 51, false, 'active', 5,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000001',
   'cup-carrier-4', 'ถาดหิ้วแก้ว 4 ช่อง',
   'ถาดกระดาษหิ้วแก้ว 4 ช่องสำหรับงานเดลิเวอรี',
   960.00, 'SM-CUP-CARRIER-4', 23, false, 'active', 6,
   'pack', 200, 2),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002',
   'kraft-noodle-box', 'กล่องคราฟท์ใส่อาหารทรงสูง',
   'กล่องเคลือบกันซึมสำหรับข้าวและเส้น มีสองขนาดให้เลือก',
   890.00, 'SM-BOX-NOODLE', 26, true, 'active', 7,
   'carton', 300, 1),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002',
   'bagasse-clamshell-9in', 'กล่องชานอ้อย 9 นิ้ว',
   'กล่องฝาพับจากเยื่อชานอ้อยสำหรับอาหารจานเดียว',
   980.00, 'SM-BOX-BAGASSE-9', 24, false, 'active', 8,
   'carton', 200, 1),
  ('b1000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000002',
   'pp-microwave-bowl-750', 'ถ้วยพลาสติก PP เข้าไมโครเวฟ 750 มล.',
   'ถ้วย PP ฝาล็อกแน่น เข้าไมโครเวฟได้',
   1180.00, 'SM-BOWL-PP-750', 28, false, 'active', 9,
   'carton', 300, 1),
  ('b1000000-0000-0000-0000-000000000023', 'a1000000-0000-0000-0000-000000000002',
   'rice-tray-2-compartment', 'ถาดอาหาร 2 ช่องพร้อมฝา',
   'ถาดอาหาร 2 ช่องพร้อมฝาสำหรับข้าวกล่อง',
   1420.00, 'SM-TRAY-2C', 21, false, 'active', 10,
   'carton', 300, 1),
  ('b1000000-0000-0000-0000-000000000024', 'a1000000-0000-0000-0000-000000000002',
   'soup-cup-16oz', 'ถ้วยซุปกระดาษ 16 ออนซ์พร้อมฝา',
   'ถ้วยกระดาษทรงสูงพร้อมฝาสำหรับซุปและโจ๊ก',
   1090.00, 'SM-CUP-SOUP-16', 30, false, 'active', 11,
   'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002',
   'sauce-cup-2oz', 'ถ้วยน้ำจิ้ม 2 ออนซ์พร้อมฝา',
   'ถ้วยใสขนาดเล็กพร้อมฝาปิดแน่นสำหรับซอสและท็อปปิง',
   1320.00, 'SM-CUP-SAUCE-2', 37, false, 'active', 12,
   'carton', 2000, 1),
  ('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000003',
   'kraft-bag-small', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด S',
   'ถุงทรงตั้งสำหรับขนมและสินค้าเบา',
   1150.00, 'SM-BAG-KRAFT-S', 19, false, 'active', 13,
   'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000003',
   'kraft-bag-medium', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด M',
   'ถุงทรงตั้งสำหรับกล่องอาหารและชุดของฝาก',
   1390.00, 'SM-BAG-KRAFT-M', 22, false, 'active', 14,
   'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000025', 'a1000000-0000-0000-0000-000000000003',
   'kraft-bag-large', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด L',
   'ถุงทรงตั้งขนาดใหญ่สำหรับชุดอาหารหลายกล่อง',
   1620.00, 'SM-BAG-KRAFT-L', 17, false, 'active', 15,
   'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000003',
   'greaseproof-snack-bag', 'ถุงกระดาษกันมันสำหรับของทอด',
   'ถุงเปิดปากสำหรับเฟรนช์ฟรายส์และของว่าง',
   760.00, 'SM-BAG-GREASE', 35, false, 'active', 16,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000026', 'a1000000-0000-0000-0000-000000000003',
   'bakery-window-bag', 'ถุงกระดาษหน้าต่างใสสำหรับเบเกอรี',
   'ถุงกระดาษมีหน้าต่างใสสำหรับขนมอบและเบเกอรี',
   880.00, 'SM-BAG-WINDOW', 26, false, 'active', 17,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000027', 'a1000000-0000-0000-0000-000000000003',
   'delivery-flat-bag', 'ถุงกระดาษก้นแบนสำหรับเดลิเวอรี',
   'ถุงกระดาษก้นแบนวางตั้งได้สำหรับงานส่งอาหาร',
   1040.00, 'SM-BAG-FLAT', 24, false, 'active', 18,
   'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000004',
   'thermal-label-50x30', 'ฉลากความร้อน 50 × 30 มม.',
   'ฉลากเปล่าสำหรับพิมพ์ราคาและวันที่ผลิต',
   95.00, 'SM-LABEL-5030', 120, false, 'active', 19,
   'roll', 1000, 6),
  ('b1000000-0000-0000-0000-000000000028', 'a1000000-0000-0000-0000-000000000004',
   'thermal-label-40x25', 'ฉลากความร้อน 40 × 25 มม.',
   'ฉลากความร้อนขนาดเล็กสำหรับติดแก้วและถ้วย',
   82.00, 'SM-LABEL-4025', 140, false, 'active', 20,
   'roll', 1000, 6),
  ('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000004',
   'blank-sticker-roll-40mm', 'สติกเกอร์เปล่าทรงกลม 40 มม.',
   'สติกเกอร์กระดาษขาวสำหรับปิดถุงและติดแก้ว',
   120.00, 'SM-STICKER-40', 86, false, 'active', 21,
   'roll', 500, 4),
  ('b1000000-0000-0000-0000-000000000029', 'a1000000-0000-0000-0000-000000000004',
   'fragile-sticker-roll', 'สติกเกอร์ระวังแตก',
   'สติกเกอร์เตือนสำหรับพัสดุและกล่องที่ต้องระวัง',
   145.00, 'SM-STICKER-FRAGILE', 72, false, 'active', 22,
   'roll', 500, 3),
  ('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000004',
   'date-label-pack', 'สติกเกอร์ระบุวันผลิตแบบเขียน',
   'สติกเกอร์สำหรับจัดการวัตถุดิบและวันหมดอายุ',
   180.00, 'SM-LABEL-DATE', 64, false, 'active', 23,
   'pack', 500, 2),
  ('b1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000004',
   'receipt-roll-58mm', 'กระดาษใบเสร็จ 58 มม.',
   'กระดาษความร้อนสำหรับเครื่องพิมพ์ใบเสร็จหน้าร้าน',
   210.00, 'SM-ROLL-RECEIPT-58', 95, false, 'active', 24,
   'pack', 10, 2),
  ('b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000005',
   'stainless-bar-spoon', 'ช้อนบาร์สเตนเลสด้ามเกลียว',
   'ช้อนด้ามยาวสำหรับคนเครื่องดื่มและตวงชั้น',
   540.00, 'SM-BAR-SPOON', 18, false, 'active', 25,
   'pack', 12, 1),
  ('b1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000005',
   'ice-scoop-stainless', 'ที่ตักน้ำแข็งสเตนเลส',
   'ที่ตักน้ำแข็งสเตนเลสสำหรับงานบาร์และหน้าร้าน',
   620.00, 'SM-BAR-SCOOP', 26, false, 'active', 26,
   'pack', 12, 1),
  ('b1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000005',
   'cocktail-shaker', 'เชคเกอร์สเตนเลส',
   'เชคเกอร์สามชิ้นสำหรับบาร์กาแฟและเครื่องดื่ม มีสองขนาด',
   2160.00, 'SM-BAR-SHAKER', 15, true, 'active', 27,
   'case', 24, 1),
  ('b1000000-0000-0000-0000-000000000032', 'a1000000-0000-0000-0000-000000000005',
   'milk-pitcher-600ml', 'เหยือกตีฟองนม 600 มล.',
   'เหยือกสเตนเลสสำหรับตีฟองนมและเทลาย',
   1180.00, 'SM-BAR-PITCHER-600', 20, false, 'active', 28,
   'pack', 12, 1),
  ('b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000005',
   'syrup-pump-pack', 'หัวปั๊มไซรัปมาตรฐาน',
   'หัวปั๊มปริมาณคงที่สำหรับขวดไซรัปร้านกาแฟ',
   390.00, 'SM-BAR-PUMP', 43, false, 'active', 29,
   'pack', 6, 1),
  ('b1000000-0000-0000-0000-000000000033', 'a1000000-0000-0000-0000-000000000005',
   'muddler-wood', 'ไม้บดสมุนไพรด้ามไม้',
   'ไม้บดสมุนไพรและผลไม้สำหรับเครื่องดื่มสด',
   480.00, 'SM-BAR-MUDDLER', 22, false, 'active', 30,
   'pack', 12, 1),
  ('b1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000006',
   'bagasse-plate-9in', 'จานชานอ้อย 9 นิ้ว',
   'จานเยื่อธรรมชาติสำหรับอาหารจัดเลี้ยงและงานอีเวนต์',
   1250.00, 'SM-ECO-PLATE-9', 29, false, 'active', 31,
   'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000034', 'a1000000-0000-0000-0000-000000000006',
   'kraft-soup-bowl-500', 'ชามกระดาษคราฟท์ 500 มล.',
   'ชามกระดาษคราฟท์พร้อมฝาสำหรับซุปและอาหารร้อน',
   1120.00, 'SM-ECO-BOWL-500', 25, false, 'active', 32,
   'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000006',
   'compostable-straw', 'หลอดย่อยสลายได้',
   'หลอดจากวัสดุย่อยสลายได้ มีขนาดมาตรฐานและขนาดชานม',
   980.00, 'SM-ECO-STRAW', 33, true, 'active', 33,
   'case', 1000, 1),
  ('b1000000-0000-0000-0000-000000000035', 'a1000000-0000-0000-0000-000000000006',
   'wooden-stirrer', 'ไม้คนกาแฟ',
   'ไม้คนเครื่องดื่มแบบใช้ครั้งเดียว ย่อยสลายได้',
   340.00, 'SM-ECO-STIRRER', 40, false, 'active', 34,
   'case', 2000, 1),
  ('b1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000006',
   'bioplastic-cutlery-set', 'ชุดช้อนส้อมไบโอพลาสติก',
   'ชุดช้อนส้อมบรรจุแยกสำหรับอาหารเดลิเวอรี',
   1480.00, 'SM-ECO-CUTLERY', 27, false, 'active', 35,
   'case', 500, 1),
  ('b1000000-0000-0000-0000-000000000036', 'a1000000-0000-0000-0000-000000000006',
   'paper-lunch-box-eco', 'กล่องกระดาษคราฟท์รักษ์โลก 1 ช่อง',
   'กล่องกระดาษคราฟท์หนึ่งช่องสำหรับข้าวกล่องรักษ์โลก',
   1310.00, 'SM-ECO-LUNCH', 23, false, 'active', 36,
   'carton', 300, 1)
on conflict (id) do nothing;

insert into public.product_images (product_id, storage_path, alt, sort_order) values
  ('b1000000-0000-0000-0000-000000000001', '/images/supplymate/products/clear-cup-16oz.svg', 'แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม', 0),
  ('b1000000-0000-0000-0000-000000000002', '/images/supplymate/products/pet-cup-22oz.svg', 'แก้ว PET ใส 22 ออนซ์', 0),
  ('b1000000-0000-0000-0000-000000000019', '/images/supplymate/products/hot-cup-8oz.svg', 'แก้วกระดาษร้อน 8 ออนซ์', 0),
  ('b1000000-0000-0000-0000-000000000003', '/images/supplymate/products/black-flat-lid-95mm.svg', 'ฝาเรียบสีดำ 95 มม.', 0),
  ('b1000000-0000-0000-0000-000000000020', '/images/supplymate/products/dome-lid-95mm.svg', 'ฝาโดมใส 95 มม.', 0),
  ('b1000000-0000-0000-0000-000000000021', '/images/supplymate/products/cup-carrier-4.svg', 'ถาดหิ้วแก้ว 4 ช่อง', 0),
  ('b1000000-0000-0000-0000-000000000004', '/images/supplymate/products/kraft-noodle-box.svg', 'กล่องคราฟท์ใส่อาหารทรงสูง', 0),
  ('b1000000-0000-0000-0000-000000000005', '/images/supplymate/products/bagasse-clamshell-9in.svg', 'กล่องชานอ้อย 9 นิ้ว', 0),
  ('b1000000-0000-0000-0000-000000000022', '/images/supplymate/products/pp-microwave-bowl-750.svg', 'ถ้วยพลาสติก PP เข้าไมโครเวฟ 750 มล.', 0),
  ('b1000000-0000-0000-0000-000000000023', '/images/supplymate/products/rice-tray-2-compartment.svg', 'ถาดอาหาร 2 ช่องพร้อมฝา', 0),
  ('b1000000-0000-0000-0000-000000000024', '/images/supplymate/products/soup-cup-16oz.svg', 'ถ้วยซุปกระดาษ 16 ออนซ์พร้อมฝา', 0),
  ('b1000000-0000-0000-0000-000000000006', '/images/supplymate/products/sauce-cup-2oz.svg', 'ถ้วยน้ำจิ้ม 2 ออนซ์พร้อมฝา', 0),
  ('b1000000-0000-0000-0000-000000000007', '/images/supplymate/products/kraft-bag-small.svg', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด S', 0),
  ('b1000000-0000-0000-0000-000000000008', '/images/supplymate/products/kraft-bag-medium.svg', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด M', 0),
  ('b1000000-0000-0000-0000-000000000025', '/images/supplymate/products/kraft-bag-large.svg', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด L', 0),
  ('b1000000-0000-0000-0000-000000000009', '/images/supplymate/products/greaseproof-snack-bag.svg', 'ถุงกระดาษกันมันสำหรับของทอด', 0),
  ('b1000000-0000-0000-0000-000000000026', '/images/supplymate/products/bakery-window-bag.svg', 'ถุงกระดาษหน้าต่างใสสำหรับเบเกอรี', 0),
  ('b1000000-0000-0000-0000-000000000027', '/images/supplymate/products/delivery-flat-bag.svg', 'ถุงกระดาษก้นแบนสำหรับเดลิเวอรี', 0),
  ('b1000000-0000-0000-0000-000000000010', '/images/supplymate/products/thermal-label-50x30.svg', 'ฉลากความร้อน 50 × 30 มม.', 0),
  ('b1000000-0000-0000-0000-000000000028', '/images/supplymate/products/thermal-label-40x25.svg', 'ฉลากความร้อน 40 × 25 มม.', 0),
  ('b1000000-0000-0000-0000-000000000011', '/images/supplymate/products/blank-sticker-roll-40mm.svg', 'สติกเกอร์เปล่าทรงกลม 40 มม.', 0),
  ('b1000000-0000-0000-0000-000000000029', '/images/supplymate/products/fragile-sticker-roll.svg', 'สติกเกอร์ระวังแตก', 0),
  ('b1000000-0000-0000-0000-000000000012', '/images/supplymate/products/date-label-pack.svg', 'สติกเกอร์ระบุวันผลิตแบบเขียน', 0),
  ('b1000000-0000-0000-0000-000000000030', '/images/supplymate/products/receipt-roll-58mm.svg', 'กระดาษใบเสร็จ 58 มม.', 0),
  ('b1000000-0000-0000-0000-000000000013', '/images/supplymate/products/stainless-bar-spoon.svg', 'ช้อนบาร์สเตนเลสด้ามเกลียว', 0),
  ('b1000000-0000-0000-0000-000000000031', '/images/supplymate/products/ice-scoop-stainless.svg', 'ที่ตักน้ำแข็งสเตนเลส', 0),
  ('b1000000-0000-0000-0000-000000000014', '/images/supplymate/products/cocktail-shaker.svg', 'เชคเกอร์สเตนเลส', 0),
  ('b1000000-0000-0000-0000-000000000032', '/images/supplymate/products/milk-pitcher-600ml.svg', 'เหยือกตีฟองนม 600 มล.', 0),
  ('b1000000-0000-0000-0000-000000000015', '/images/supplymate/products/syrup-pump-pack.svg', 'หัวปั๊มไซรัปมาตรฐาน', 0),
  ('b1000000-0000-0000-0000-000000000033', '/images/supplymate/products/muddler-wood.svg', 'ไม้บดสมุนไพรด้ามไม้', 0),
  ('b1000000-0000-0000-0000-000000000016', '/images/supplymate/products/bagasse-plate-9in.svg', 'จานชานอ้อย 9 นิ้ว', 0),
  ('b1000000-0000-0000-0000-000000000034', '/images/supplymate/products/kraft-soup-bowl-500.svg', 'ชามกระดาษคราฟท์ 500 มล.', 0),
  ('b1000000-0000-0000-0000-000000000017', '/images/supplymate/products/compostable-straw.svg', 'หลอดย่อยสลายได้', 0),
  ('b1000000-0000-0000-0000-000000000035', '/images/supplymate/products/wooden-stirrer.svg', 'ไม้คนกาแฟ', 0),
  ('b1000000-0000-0000-0000-000000000018', '/images/supplymate/products/bioplastic-cutlery-set.svg', 'ชุดช้อนส้อมไบโอพลาสติก', 0),
  ('b1000000-0000-0000-0000-000000000036', '/images/supplymate/products/paper-lunch-box-eco.svg', 'กล่องกระดาษคราฟท์รักษ์โลก 1 ช่อง', 0)
on conflict do nothing;
-- END generated catalogue

-- Variants exist only for choices a buyer genuinely makes: container size,
-- tool size, and straw size.
insert into public.product_variants (
  id, product_id, name, sku, price_override, stock_quantity, options, sort_order
) values
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004',
   '750 มล.', 'SM-BOX-NOODLE-750', 890.00, 14, '{"size":"750 ml"}', 1),
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000004',
   '1,000 มล.', 'SM-BOX-NOODLE-1000', 990.00, 12, '{"size":"1000 ml"}', 2),
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000014',
   '500 มล.', 'SM-BAR-SHAKER-500', 2160.00, 8, '{"size":"500 ml"}', 1),
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000014',
   '750 มล.', 'SM-BAR-SHAKER-750', 2380.00, 7, '{"size":"750 ml"}', 2),
  ('d1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000017',
   'หลอดตรง 6 มม.', 'SM-ECO-STRAW-6', 980.00, 18, '{"size":"6 mm"}', 1),
  ('d1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000017',
   'หลอดชานม 12 มม.', 'SM-ECO-STRAW-12', 1190.00, 15, '{"size":"12 mm"}', 2)
on conflict (id) do nothing;

insert into public.addresses (
  id, user_id, label, recipient_name, phone, line1, subdistrict, district,
  province, postal_code, is_default
) values (
  'c1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
  'ร้าน', 'ร้านกาแฟตัวอย่าง', '0812345678', '123 ถนนสุขุมวิท', 'คลองเตย',
  'คลองเตย', 'กรุงเทพมหานคร', '10110', true
)
on conflict (id) do nothing;

-- Sample orders always use the production RPC, each in its own transaction
-- because create_order() owns a transaction-scoped temporary cart table.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true);
select public.create_order(
  jsonb_build_array(jsonb_build_object(
    'product_id', 'b1000000-0000-0000-0000-000000000001', 'variant_id', null, 'quantity', 1)),
  'c1000000-0000-0000-0000-000000000001', null, null, null,
  jsonb_build_object('business_name', 'ร้านกาแฟตัวอย่าง', 'tax_id', '0105567000001', 'branch_name', 'สำนักงานใหญ่')
);
commit;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true);
select public.create_order(
  jsonb_build_array(jsonb_build_object(
    'product_id', 'b1000000-0000-0000-0000-000000000005', 'variant_id', null, 'quantity', 2)),
  'c1000000-0000-0000-0000-000000000001', null, null, null,
  jsonb_build_object('business_name', 'ร้านกาแฟตัวอย่าง')
);
commit;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true);
select public.create_order(
  jsonb_build_array(jsonb_build_object(
    'product_id', 'b1000000-0000-0000-0000-000000000010', 'variant_id', null, 'quantity', 6)),
  'c1000000-0000-0000-0000-000000000001', null, null, null,
  jsonb_build_object('business_name', 'ร้านกาแฟตัวอย่าง')
);
commit;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true);
select public.create_order(
  jsonb_build_array(jsonb_build_object(
    'product_id', 'b1000000-0000-0000-0000-000000000018', 'variant_id', null, 'quantity', 3)),
  'c1000000-0000-0000-0000-000000000001', null, null, null,
  jsonb_build_object('business_name', 'ร้านกาแฟตัวอย่าง', 'branch_name', 'สาขาทดสอบ')
);
commit;

-- Advance three examples through the existing trigger-enforced lifecycle.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true);

update public.orders set status = 'verified'
 where order_number in (select order_number from public.orders order by order_number limit 3 offset 1);
update public.orders set status = 'shipped'
 where order_number in (select order_number from public.orders order by order_number limit 2 offset 2);
update public.orders set status = 'done'
 where order_number in (select order_number from public.orders order by order_number limit 1 offset 3);

reset request.jwt.claims;
commit;
