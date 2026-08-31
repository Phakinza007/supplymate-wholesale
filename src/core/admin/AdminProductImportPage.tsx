import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { parseCsv } from '@/lib/csv'
import {
  csvTemplate,
  IMPORT_COLUMNS,
  parseProductRows,
  type ParsedProductRow,
  type RowError,
} from '@/core/admin/productCsv'
import { useProductImport, type ImportResult } from '@/core/admin/useProductImport'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { productStatusLabel } from '@/lib/productStatus'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/PageHeader'

const MAX_CSV_BYTES = 5 * 1024 * 1024
const PREVIEW_LIMIT = 20

export function AdminProductImportPage() {
  const [rows, setRows] = useState<ParsedProductRow[] | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importProducts = useProductImport()

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setResult(null)
    setProgress(null)
    if (file.size > MAX_CSV_BYTES) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
      return
    }

    try {
      const parsed = parseProductRows(parseCsv(await file.text()))
      setFileName(file.name)
      setRows(parsed.rows)
      setColumns(parsed.columns)
      setRowErrors(parsed.errors)
    } catch (err) {
      setError(getErrorMessage(err, 'อ่านไฟล์ไม่สำเร็จ'))
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'supplymate-products-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function runImport() {
    if (!rows || rows.length === 0) return
    setError(null)
    setProgress({ done: 0, total: rows.length })
    try {
      const imported = await importProducts.mutateAsync({
        rows,
        columns,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(imported)
      setRows(null)
      setColumns([])
      setRowErrors([])
    } catch (err) {
      setError(getErrorMessage(err, 'นำเข้าสินค้าไม่สำเร็จ'))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8 md:px-0">
      <PageHeader
        title="นำเข้าสินค้าจากไฟล์ CSV"
        action={
          <Button variant="outline" asChild>
            <Link to="/admin/products">กลับไปหน้ารายการ</Link>
          </Button>
        }
      />

      <div className="rounded-md border border-border bg-card p-4 text-sm">
        <p className="mb-2 font-semibold">คอลัมน์ที่รองรับ</p>
        <p className="text-muted-foreground">
          จำเป็น: <code>name</code>, <code>slug</code>, <code>price</code> · ไม่บังคับ:{' '}
          {IMPORT_COLUMNS.filter((c) => !['name', 'slug', 'price'].includes(c)).join(', ')}
        </p>
        <p className="mt-2 text-muted-foreground">
          แถวที่ <code>slug</code> ยังไม่มีในระบบจะถูก<strong>เพิ่มใหม่เป็นแบบร่าง</strong> ส่วนแถวที่มีอยู่แล้วจะถูก
          <strong>อัปเดตเฉพาะคอลัมน์ที่มีอยู่ในไฟล์</strong> คอลัมน์ที่ไม่ได้ใส่มาจะคงค่าเดิมไว้ รวมถึงสถานะ
          เว้นแต่ไฟล์จะระบุคอลัมน์ <code>status</code> มาด้วย
        </p>
        <Button variant="outline" className="mt-3" onClick={downloadTemplate}>
          ดาวน์โหลดไฟล์ตัวอย่าง
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv" className="text-sm font-semibold">
          เลือกไฟล์ CSV
        </label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-semibold"
        />
        {fileName && <p className="font-mono text-sm text-muted-foreground">{fileName}</p>}
      </div>

      {error && <Alert tone="error" title="นำเข้าไม่สำเร็จ">{error}</Alert>}

      {rowErrors.length > 0 && (
        <Alert tone="warning" title={`ข้ามไป ${rowErrors.length} แถวเพราะข้อมูลไม่ถูกต้อง`}>
          <ul className="flex flex-col gap-1">
            {rowErrors.slice(0, PREVIEW_LIMIT).map((rowError) => (
              <li key={rowError.line}>
                บรรทัด {rowError.line}: {rowError.message}
              </li>
            ))}
          </ul>
          {rowErrors.length > PREVIEW_LIMIT && (
            <p className="mt-1">…และอีก {rowErrors.length - PREVIEW_LIMIT} แถว</p>
          )}
        </Alert>
      )}

      {rows && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold tabular-nums">พร้อมนำเข้า {rows.length} รายการ</p>
          {rows.length > 0 && (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>name</TableHead>
                    <TableHead>slug</TableHead>
                    <TableHead numeric>price</TableHead>
                    <TableHead>status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, PREVIEW_LIMIT).map((row) => (
                    <TableRow key={row.slug}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                      <TableCell numeric>{formatPrice(row.price)}</TableCell>
                      <TableCell>
                        {row.status ? productStatusLabel(row.status) : 'ตามเดิม / แบบร่าง'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Say what was left out rather than letting the preview imply the
                  file is only this long. */}
              {rows.length > PREVIEW_LIMIT && (
                <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                  แสดง {PREVIEW_LIMIT} จาก {rows.length} รายการ
                </p>
              )}
            </div>
          )}
          <div>
            <Button onClick={runImport} disabled={rows.length === 0} loading={importProducts.isPending}>
              {progress
                ? `กำลังนำเข้า ${progress.done}/${progress.total}…`
                : `ยืนยันนำเข้า ${rows.length} รายการ`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="นำเข้าเสร็จสิ้น">
            <span className="tabular-nums">
              เพิ่มใหม่ {result.inserted} รายการ · อัปเดต {result.updated} รายการ
            </span>
          </Alert>
          {result.failures.length > 0 && (
            <Alert tone="error" title={`ไม่สำเร็จ ${result.failures.length} รายการ`}>
              <ul className="flex flex-col gap-1">
                {result.failures.slice(0, PREVIEW_LIMIT).map((failure) => (
                  <li key={failure.slug}>
                    {failure.slug}: {failure.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}
