import { useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ORDER_STATUS_VALUES, orderStatusLabel, orderStatusTone } from '@/lib/orderStatus'

/**
 * Every primitive in every state, on one page, reachable without a Supabase
 * project. It lives in the showcase for that reason: the design system has to
 * be inspectable in a fresh clone, before any backend exists.
 *
 * Deliberately not linked from the site nav — it is a workbench, not a page a
 * buyer should land on.
 */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">{children}</div>
    </section>
  )
}

const SAMPLE_ORDERS = [
  { ref: 'SM-004821', who: 'กาแฟริมคลอง', status: 'pending', total: 12_900 },
  { ref: 'SM-004820', who: 'ครัวกลางบางนา', status: 'shipped', total: 3_870 },
  { ref: 'SM-004819', who: 'คาเฟ่ท่าเรือ', status: 'done', total: 890 },
  { ref: 'SM-004818', who: 'ร้านอาหารสวนผัก', status: 'cancelled', total: 5_400 },
  { ref: 'SM-004817', who: 'เบเกอรีหน้าปากซอย', status: 'verified', total: 2_150 },
]

export function PrimitivesPage() {
  const [shopName, setShopName] = useState('')

  return (
    <div className="flex flex-col gap-6 pb-16">
      <header>
        <h1 className="text-[length:var(--text-app-title)] font-bold tracking-tight">
          Primitives
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          ระบบ component ของ <code className="font-mono text-xs">src/components/ui</code> — ทุกตัว ทุกสถานะ
          ใช้ตรวจก่อนนำไปประกอบหน้าจริง
        </p>
      </header>

      <Section title="Button — variants">
        <Button>ยืนยันคำสั่งซื้อ</Button>
        <Button variant="outline">แก้ไข</Button>
        <Button variant="secondary">สำรอง</Button>
        <Button variant="ghost">ยกเลิก</Button>
        <Button variant="destructive">ลบ</Button>
        <Button variant="link">ดูรายละเอียด</Button>
      </Section>

      <Section title="Button — states & sizes" note="ค่าเริ่มต้นสูง 44px; ใช้ size=sm เฉพาะหน้าที่ใช้เมาส์เป็นหลัก">
        <Button loading>กำลังบันทึก</Button>
        <Button disabled>ปิดใช้งาน</Button>
        <Button variant="outline" loading>
          กำลังโหลด
        </Button>
        <Button size="sm">เล็ก (admin)</Button>
        <Button size="lg">ใหญ่</Button>
      </Section>

      <Section title="Field" note="ต่อสาย htmlFor / aria-describedby / aria-invalid ให้เองทั้งหมด">
        <Field label="ชื่อร้าน" className="w-60">
          <Input
            value={shopName}
            onChange={(event) => setShopName(event.target.value)}
            placeholder="กาแฟริมคลอง"
          />
        </Field>
        <Field label="เลขประจำตัวผู้เสียภาษี" hint="13 หลัก ไม่ต้องใส่ขีด" className="w-60" required>
          <Input inputMode="numeric" placeholder="0105567000001" />
        </Field>
        <Field label="อีเมล" error="อีเมลนี้ถูกใช้งานแล้ว" className="w-60">
          <Input type="email" defaultValue="a@b.co" />
        </Field>
        <Field label="หมวดสินค้า" className="w-60">
          <Select defaultValue="cups">
            <option value="cups">แก้วและฝา</option>
            <option value="bags">ถุงกระดาษ</option>
          </Select>
        </Field>
        <Field label="แก้ไขไม่ได้" className="w-60">
          <Input disabled defaultValue="ปิดใช้งาน" />
        </Field>
        <Field label="รายละเอียดสินค้า" className="w-full max-w-xl">
          <Textarea placeholder="แก้ว PET สำหรับเครื่องดื่มเย็น เหมาะกับคาเฟ่และร้านเครื่องดื่ม" />
        </Field>
        <div className="flex w-full flex-wrap gap-6">
          <Checkbox defaultChecked>ตั้งเป็นที่อยู่หลัก</Checkbox>
          <Checkbox>รับข่าวสารโปรโมชัน</Checkbox>
          <Checkbox disabled>ปิดใช้งาน</Checkbox>
        </div>
      </Section>

      <Section title="Badge — สถานะคำสั่งซื้อ">
        {ORDER_STATUS_VALUES.map((status) => (
          <Badge key={status} tone={orderStatusTone(status)}>
            {orderStatusLabel(status, 'short')}
          </Badge>
        ))}
        <Badge>แบบร่าง</Badge>
      </Section>

      <Section title="Alert">
        <div className="flex w-full flex-col gap-3">
          <Alert tone="info" title="ยังไม่ได้ยืนยันอีเมล">ส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว</Alert>
          <Alert tone="warning" title="สินค้าบางรายการต่ำกว่าขั้นต่ำ">ปรับจำนวนก่อนดำเนินการต่อ</Alert>
          <Alert tone="success" title="ตรวจสอบการชำระเงินแล้ว" />
          <Alert tone="error" title="บันทึกไม่สำเร็จ">one or more items are unavailable</Alert>
        </div>
      </Section>

      <Section title="Table" note="stickyHeader ใส่เพดานความสูงให้ container เพื่อให้หัวตารางค้างได้จริง">
        <Table stickyHeader className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead numeric>ยอดรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_ORDERS.map((order) => (
              <TableRow key={order.ref}>
                <TableCell className="font-mono text-xs">{order.ref}</TableCell>
                <TableCell>{order.who}</TableCell>
                <TableCell>
                  <Badge tone={orderStatusTone(order.status)}>
                    {orderStatusLabel(order.status, 'short')}
                  </Badge>
                </TableCell>
                <TableCell numeric>฿{order.total.toLocaleString('th-TH')}.00</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Skeleton & EmptyState" note="โหลด = โครงร่างของเนื้อหา / ว่าง = สอนวิธีใช้ / ล้มเหลว = Alert">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-11 w-32" />
          </div>
          <EmptyState
            icon={<PackageOpen />}
            title="ยังไม่มีสินค้าในแคตตาล็อก"
            description="เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นในหน้าแคตตาล็อก ระบุหน่วยสั่งซื้อและจำนวนขั้นต่ำให้ครบ"
            action={<Button size="sm">เพิ่มสินค้า</Button>}
          />
        </div>
      </Section>
    </div>
  )
}
