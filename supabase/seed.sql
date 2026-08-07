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

-- Six buyer-facing supply categories.
insert into public.categories (id, slug, name, description, sort_order) values
  ('a1000000-0000-0000-0000-000000000001', 'cups-lids', 'แก้วและฝา',
   'แก้ว ฝา และอุปกรณ์สำหรับเครื่องดื่มเย็น', 1),
  ('a1000000-0000-0000-0000-000000000002', 'food-containers', 'กล่องอาหาร',
   'กล่องและถ้วยสำหรับอาหารเดลิเวอรี', 2),
  ('a1000000-0000-0000-0000-000000000003', 'paper-bags', 'ถุงกระดาษ',
   'ถุงกระดาษสำหรับร้านอาหารและเบเกอรี', 3),
  ('a1000000-0000-0000-0000-000000000004', 'labels', 'ฉลากและสติกเกอร์',
   'ฉลากม้วนและสติกเกอร์สำหรับงานหน้าร้าน', 4),
  ('a1000000-0000-0000-0000-000000000005', 'bar-tools', 'อุปกรณ์บาร์',
   'อุปกรณ์ชงและเสิร์ฟเครื่องดื่มสำหรับร้านค้า', 5),
  ('a1000000-0000-0000-0000-000000000006', 'eco-packaging', 'บรรจุภัณฑ์รักษ์โลก',
   'บรรจุภัณฑ์ทางเลือกสำหรับลดพลาสติกใช้ครั้งเดียว', 6)
on conflict (id) do nothing;

-- Prices are per package. Every item has local owned imagery, available
-- stock, an explicit pack size, and a database-enforced order minimum.
insert into public.products (
  id, category_id, slug, name, description, price, sku, stock_quantity,
  has_variants, sort_order, package_unit, units_per_package, min_order_quantity
) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'clear-cup-16oz', 'แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม',
   'แก้ว PET ใสพร้อมฝาโดมสำหรับกาแฟเย็นและเครื่องดื่มปั่น', 1650.00, 'SM-CUP-16-DOME', 42,
   false, 1, 'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
   'pet-cup-22oz', 'แก้ว PET ใส 22 ออนซ์',
   'แก้วใสทรงสูงสำหรับชาเย็นและเครื่องดื่มขนาดใหญ่', 1780.00, 'SM-CUP-22', 31,
   false, 2, 'carton', 1000, 1),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
   'black-flat-lid-95mm', 'ฝาเรียบสีดำ 95 มม.',
   'ฝาปิดแก้วทรงเรียบพร้อมช่องเสียบหลอด', 720.00, 'SM-LID-95-BLK', 58,
   false, 3, 'carton', 1000, 1),

  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002',
   'kraft-noodle-box', 'กล่องคราฟท์ใส่อาหารทรงสูง',
   'กล่องเคลือบกันซึมสำหรับข้าวและเส้น มีสองขนาดให้เลือก', 890.00, 'SM-BOX-NOODLE', 26,
   true, 4, 'carton', 300, 1),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002',
   'bagasse-clamshell-9in', 'กล่องชานอ้อย 9 นิ้ว',
   'กล่องฝาพับจากเยื่อชานอ้อยสำหรับอาหารจานเดียว', 980.00, 'SM-BOX-BAGASSE-9', 24,
   false, 5, 'carton', 200, 1),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002',
   'sauce-cup-2oz', 'ถ้วยน้ำจิ้ม 2 ออนซ์พร้อมฝา',
   'ถ้วยใสขนาดเล็กพร้อมฝาปิดแน่นสำหรับซอสและท็อปปิง', 1320.00, 'SM-CUP-SAUCE-2', 37,
   false, 6, 'carton', 2000, 1),

  ('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000003',
   'kraft-bag-small', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด S',
   'ถุงทรงตั้งสำหรับขนมและสินค้าเบา', 1150.00, 'SM-BAG-KRAFT-S', 19,
   false, 7, 'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000003',
   'kraft-bag-medium', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด M',
   'ถุงทรงตั้งสำหรับกล่องอาหารและชุดของฝาก', 1390.00, 'SM-BAG-KRAFT-M', 22,
   false, 8, 'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000003',
   'greaseproof-snack-bag', 'ถุงกระดาษกันมันสำหรับของทอด',
   'ถุงเปิดปากสำหรับเฟรนช์ฟรายส์และของว่าง', 760.00, 'SM-BAG-GREASE', 35,
   false, 9, 'carton', 1000, 1),

  ('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000004',
   'thermal-label-50x30', 'ฉลากความร้อน 50 × 30 มม.',
   'ฉลากเปล่าสำหรับพิมพ์ราคาและวันที่ผลิต', 95.00, 'SM-LABEL-5030', 120,
   false, 10, 'roll', 1000, 6),
  ('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000004',
   'blank-sticker-roll-40mm', 'สติกเกอร์เปล่าทรงกลม 40 มม.',
   'สติกเกอร์กระดาษขาวสำหรับปิดถุงและติดแก้ว', 120.00, 'SM-STICKER-40', 86,
   false, 11, 'roll', 500, 4),
  ('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000004',
   'date-label-pack', 'สติกเกอร์ระบุวันผลิตแบบเขียน',
   'สติกเกอร์สำหรับจัดการวัตถุดิบและวันหมดอายุ', 180.00, 'SM-LABEL-DATE', 64,
   false, 12, 'pack', 500, 2),

  ('b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000005',
   'stainless-bar-spoon', 'ช้อนบาร์สเตนเลสด้ามเกลียว',
   'ช้อนด้ามยาวสำหรับคนเครื่องดื่มและตวงชั้น', 540.00, 'SM-BAR-SPOON', 18,
   false, 13, 'pack', 12, 1),
  ('b1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000005',
   'cocktail-shaker', 'เชคเกอร์สเตนเลส',
   'เชคเกอร์สามชิ้นสำหรับบาร์กาแฟและเครื่องดื่ม มีสองขนาด', 2160.00, 'SM-BAR-SHAKER', 15,
   true, 14, 'case', 24, 1),
  ('b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000005',
   'syrup-pump-pack', 'หัวปั๊มไซรัปมาตรฐาน',
   'หัวปั๊มปริมาณคงที่สำหรับขวดไซรัปร้านกาแฟ', 390.00, 'SM-BAR-PUMP', 43,
   false, 15, 'pack', 6, 1),

  ('b1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000006',
   'bagasse-plate-9in', 'จานชานอ้อย 9 นิ้ว',
   'จานเยื่อธรรมชาติสำหรับอาหารจัดเลี้ยงและงานอีเวนต์', 1250.00, 'SM-ECO-PLATE-9', 29,
   false, 16, 'carton', 500, 1),
  ('b1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000006',
   'compostable-straw', 'หลอดย่อยสลายได้',
   'หลอดจากวัสดุย่อยสลายได้ มีขนาดมาตรฐานและขนาดชานม', 980.00, 'SM-ECO-STRAW', 33,
   true, 17, 'case', 1000, 1),
  ('b1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000006',
   'bioplastic-cutlery-set', 'ชุดช้อนส้อมไบโอพลาสติก',
   'ชุดช้อนส้อมบรรจุแยกสำหรับอาหารเดลิเวอรี', 1480.00, 'SM-ECO-CUTLERY', 27,
   false, 18, 'case', 500, 1)
on conflict (id) do nothing;

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

insert into public.product_images (product_id, storage_path, alt, sort_order) values
  ('b1000000-0000-0000-0000-000000000001', '/images/supplymate/cups-lids.png', 'แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม', 0),
  ('b1000000-0000-0000-0000-000000000002', '/images/supplymate/cups-lids.png', 'แก้ว PET ใส 22 ออนซ์', 0),
  ('b1000000-0000-0000-0000-000000000003', '/images/supplymate/cups-lids.png', 'ฝาเรียบสีดำ 95 มม.', 0),
  ('b1000000-0000-0000-0000-000000000004', '/images/supplymate/food-containers.png', 'กล่องคราฟท์ใส่อาหารทรงสูง', 0),
  ('b1000000-0000-0000-0000-000000000005', '/images/supplymate/food-containers.png', 'กล่องชานอ้อย 9 นิ้ว', 0),
  ('b1000000-0000-0000-0000-000000000006', '/images/supplymate/food-containers.png', 'ถ้วยน้ำจิ้ม 2 ออนซ์พร้อมฝา', 0),
  ('b1000000-0000-0000-0000-000000000007', '/images/supplymate/paper-bags.png', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด S', 0),
  ('b1000000-0000-0000-0000-000000000008', '/images/supplymate/paper-bags.png', 'ถุงกระดาษคราฟท์หูหิ้ว ขนาด M', 0),
  ('b1000000-0000-0000-0000-000000000009', '/images/supplymate/paper-bags.png', 'ถุงกระดาษกันมันสำหรับของทอด', 0),
  ('b1000000-0000-0000-0000-000000000010', '/images/supplymate/labels.png', 'ฉลากความร้อน 50 × 30 มม.', 0),
  ('b1000000-0000-0000-0000-000000000011', '/images/supplymate/labels.png', 'สติกเกอร์เปล่าทรงกลม 40 มม.', 0),
  ('b1000000-0000-0000-0000-000000000012', '/images/supplymate/labels.png', 'สติกเกอร์ระบุวันผลิตแบบเขียน', 0),
  ('b1000000-0000-0000-0000-000000000013', '/images/supplymate/bar-tools.png', 'ช้อนบาร์สเตนเลสด้ามเกลียว', 0),
  ('b1000000-0000-0000-0000-000000000014', '/images/supplymate/bar-tools.png', 'เชคเกอร์สเตนเลส', 0),
  ('b1000000-0000-0000-0000-000000000015', '/images/supplymate/bar-tools.png', 'หัวปั๊มไซรัปมาตรฐาน', 0),
  ('b1000000-0000-0000-0000-000000000016', '/images/supplymate/eco-packaging.png', 'จานชานอ้อย 9 นิ้ว', 0),
  ('b1000000-0000-0000-0000-000000000017', '/images/supplymate/eco-packaging.png', 'หลอดย่อยสลายได้', 0),
  ('b1000000-0000-0000-0000-000000000018', '/images/supplymate/eco-packaging.png', 'ชุดช้อนส้อมไบโอพลาสติก', 0)
on conflict do nothing;

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
