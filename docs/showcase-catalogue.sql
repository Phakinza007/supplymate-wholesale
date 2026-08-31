-- Showcase catalogue for the hosted demo.
--
-- NOT a migration and NOT seed.sql. Run it by hand, once, in the Supabase SQL
-- Editor of a demo project. It exists because a visitor lands on /shop without
-- logging in, so whatever is in there IS the pitch — and the headline feature
-- (wholesale price ladders) is invisible unless products actually have tiers.
--
-- Safe to re-run: every insert is keyed on slug and updates instead of
-- duplicating.
--
-- What it does:
--   1. archives whatever is currently on the storefront rather than deleting
--      it, so existing orders keep pointing at real product rows
--   2. adds six packaging categories
--   3. adds ten products with pack sizes and minimums a wholesaler would
--      recognise
--   4. gives most of them a price ladder, which is the whole point

begin;

-- 1. Clear the storefront without destroying history. `archived` hides a
--    product from /shop but leaves it readable from old orders.
update public.products set status = 'archived' where status <> 'archived';

-- 1b. products.sku is unique. An archived product still holding a SKU this
--     script is about to assign would block the insert, so release it — only
--     where it actually collides, and only on rows already off the storefront.
update public.products
   set sku = null
 where status = 'archived'
   and sku in ('SM-CUP-16-DOME','SM-CUP-22','SM-LID-95-BLK','SM-BOX-650-KR',
               'SM-BOX-BAG-9','SM-CUP-SAUCE-2','SM-BAG-KRAFT-M','SM-BAG-GREASE',
               'SM-LBL-5030','SM-STR-PAPER');

-- 2. Categories.
insert into public.categories (slug, name, description, sort_order, is_active) values
  ('cups-lids',       'แก้วและฝา',            'แก้วพลาสติก แก้วกระดาษ และฝาทุกขนาด', 1, true),
  ('food-containers', 'กล่องอาหาร',           'กล่องคราฟต์ กล่องชานอ้อย และถ้วยน้ำจิ้ม', 2, true),
  ('paper-bags',      'ถุงกระดาษ',            'ถุงหูหิ้วและถุงกันมันสำหรับหน้าร้าน',   3, true),
  ('labels-stickers', 'สติ๊กเกอร์และฉลาก',     'ฉลากความร้อนและสติ๊กเกอร์ติดแก้ว',      4, true),
  ('bar-tools',       'อุปกรณ์บาร์',           'หลอด ไม้คน และของใช้หลังบาร์',          5, true),
  ('eco-packaging',   'บรรจุภัณฑ์รักษ์โลก',    'วัสดุย่อยสลายได้และรีไซเคิลได้',        6, true)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_active = true;

-- 3. Products. `price` is per package (per ลัง/แพ็ก/กล่อง/ม้วน) and excludes
--    VAT — the shop adds 7% at order time.
insert into public.products
  (slug, name, description, price, sku, stock_quantity, package_unit,
   units_per_package, min_order_quantity, sort_order, status, category_id)
select v.slug, v.name, v.description, v.price, v.sku, v.stock, v.unit,
       v.per_pack, v.moq, v.sort, 'active', c.id
from (values
  ('clear-cup-16oz',      'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม', 'PET เกรดอาหาร ใสไม่ขุ่น ปากแก้ว 95 มม. ราคารวมฝาโดมแล้ว', 1650.00, 'SM-CUP-16-DOME', 42,  'carton', 1000, 1, 1,  'cups-lids'),
  ('pet-cup-22oz',        'แก้ว PET ใส 22 ออนซ์',              'ทรงสูงสำหรับชาเย็นและเครื่องดื่มขนาดใหญ่',                 1780.00, 'SM-CUP-22',      31,  'carton', 1000, 1, 2,  'cups-lids'),
  ('black-flat-lid-95mm', 'ฝาเรียบสีดำ 95 มม.',                'ใช้กับแก้วปาก 95 มม. ทุกรุ่น ปิดแน่นไม่รั่ว',              720.00,  'SM-LID-95-BLK',  58,  'carton', 1000, 1, 3,  'cups-lids'),
  ('kraft-food-box-650',  'กล่องอาหารคราฟต์ 650 มล. พร้อมฝา',  'กระดาษคราฟต์เคลือบ PE ใส่อาหารร้อนได้',                    890.00,  'SM-BOX-650-KR',  36,  'case',   300,  1, 4,  'food-containers'),
  ('bagasse-box-9',       'กล่องชานอ้อย 9 นิ้ว 3 ช่อง',        'ย่อยสลายได้ตามธรรมชาติ เข้าไมโครเวฟได้',                   980.00,  'SM-BOX-BAG-9',   24,  'case',   200,  2, 5,  'eco-packaging'),
  ('sauce-cup-2oz',       'ถ้วยน้ำจิ้ม 2 ออนซ์ พร้อมฝา',       'ฝาล็อกแน่น ไม่หกระหว่างขนส่ง',                             1320.00, 'SM-CUP-SAUCE-2', 40,  'carton', 2000, 1, 6,  'food-containers'),
  ('kraft-bag-handle-m',  'ถุงกระดาษคราฟต์หูหิ้ว ขนาด M',      'กระดาษ 120 แกรม รับน้ำหนักได้ 5 กก.',                      1150.00, 'SM-BAG-KRAFT-M', 55,  'pack',   500,  2, 7,  'paper-bags'),
  ('grease-proof-bag',    'ถุงกระดาษกันมัน สำหรับของทอด',      'เคลือบกันซึม ไม่ทะลุเมื่อใส่ของทอดร้อน',                   760.00,  'SM-BAG-GREASE',  48,  'carton', 1000, 1, 8,  'paper-bags'),
  ('thermal-label-50x30', 'ฉลากความร้อน 50 × 30 มม.',          'ใช้กับเครื่องพิมพ์ความร้อนทั่วไป ไม่ต้องใช้หมึก',           95.00,   'SM-LBL-5030',    120, 'roll',   1000, 6, 9,  'labels-stickers'),
  ('paper-straw-wrapped', 'หลอดกระดาษห่อเดี่ยว 6 มม.',         'ห่อกระดาษรายชิ้น ถูกสุขอนามัย ย่อยสลายได้',                640.00,  'SM-STR-PAPER',   33,  'carton', 2000, 2, 10, 'bar-tools')
) as v(slug, name, description, price, sku, stock, unit, per_pack, moq, sort, category_slug)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, price = excluded.price,
      sku = excluded.sku, stock_quantity = excluded.stock_quantity,
      package_unit = excluded.package_unit, units_per_package = excluded.units_per_package,
      min_order_quantity = excluded.min_order_quantity, sort_order = excluded.sort_order,
      status = 'active', category_id = excluded.category_id;

-- 4. Price ladders. Percentages rather than fixed amounts so every product's
--    ladder stays sensible against its own base price. Two products are left
--    without one on purpose: a catalogue where everything has tiers hides
--    what the "มีราคาขั้นบันได" filter and the "ยังไม่มีขั้น" admin badge are
--    actually for.
delete from public.product_price_tiers t
 using public.products p
 where p.id = t.product_id
   and p.slug in ('clear-cup-16oz','pet-cup-22oz','black-flat-lid-95mm',
                  'kraft-food-box-650','sauce-cup-2oz','kraft-bag-handle-m',
                  'thermal-label-50x30','paper-straw-wrapped');

insert into public.product_price_tiers (product_id, min_quantity, unit_price)
select p.id, s.min_qty, round(p.price * s.factor, 2)
from public.products p
join (values
  (5, 0.96), (10, 0.93), (20, 0.90), (50, 0.86), (100, 0.82)
) as s(min_qty, factor) on true
where p.slug in ('clear-cup-16oz','pet-cup-22oz','black-flat-lid-95mm',
                 'kraft-food-box-650','sauce-cup-2oz','paper-straw-wrapped')
  and s.min_qty > p.min_order_quantity;

-- The two with a higher MOQ get a ladder that starts above it, because a tier
-- at or below the minimum is unreachable and the trigger rejects it.
insert into public.product_price_tiers (product_id, min_quantity, unit_price)
select p.id, s.min_qty, round(p.price * s.factor, 2)
from public.products p
join (values
  (12, 0.95), (24, 0.91), (60, 0.87), (120, 0.83)
) as s(min_qty, factor) on true
where p.slug in ('kraft-bag-handle-m','thermal-label-50x30')
  and s.min_qty > p.min_order_quantity;

commit;

-- What the storefront should look like afterwards.
select p.name,
       p.package_unit || ' · ' || p.units_per_package || ' ชิ้น' as pack,
       p.price,
       p.price_per_piece,
       count(t.id) as tiers
  from public.products p
  left join public.product_price_tiers t on t.product_id = p.id
 where p.status = 'active'
 group by p.id, p.name, p.package_unit, p.units_per_package, p.price, p.price_per_piece, p.sort_order
 order by p.sort_order;
