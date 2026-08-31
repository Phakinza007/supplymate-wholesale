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
import { Button } from '@/components/ui/button'

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">นำเข้าสินค้าจากไฟล์ CSV</h1>
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/products">กลับไปหน้ารายการ</Link>
        </Button>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <p className="mb-2 font-medium">คอลัมน์ที่รองรับ</p>
        <p className="text-muted-foreground">
          จำเป็น: <code>name</code>, <code>slug</code>, <code>price</code> · ไม่บังคับ:{' '}
          {IMPORT_COLUMNS.filter((c) => !['name', 'slug', 'price'].includes(c)).join(', ')}
        </p>
        <p className="mt-2 text-muted-foreground">
          แถวที่ <code>slug</code> ยังไม่มีในระบบจะถูก<strong>เพิ่มใหม่เป็นแบบร่าง</strong> ส่วนแถวที่มีอยู่แล้วจะถูก
          <strong>อัปเดตเฉพาะคอลัมน์ที่มีอยู่ในไฟล์</strong> คอลัมน์ที่ไม่ได้ใส่มาจะคงค่าเดิมไว้ รวมถึงสถานะ
          เว้นแต่ไฟล์จะระบุคอลัมน์ <code>status</code> มาด้วย
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={downloadTemplate}>
          ดาวน์โหลดไฟล์ตัวอย่าง
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv" className="text-sm font-medium">
          เลือกไฟล์ CSV
        </label>
        <input id="csv" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rowErrors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 p-3 text-sm">
          <p className="font-medium text-destructive">
            ข้ามไป {rowErrors.length} แถวเพราะข้อมูลไม่ถูกต้อง
          </p>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {rowErrors.slice(0, PREVIEW_LIMIT).map((rowError) => (
              <li key={rowError.line}>
                บรรทัด {rowError.line}: {rowError.message}
              </li>
            ))}
          </ul>
          {rowErrors.length > PREVIEW_LIMIT && (
            <p className="text-muted-foreground">
              …และอีก {rowErrors.length - PREVIEW_LIMIT} แถว
            </p>
          )}
        </div>
      )}

      {rows && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">พร้อมนำเข้า {rows.length} รายการ</p>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-3">name</th>
                    <th className="py-1 pr-3">slug</th>
                    <th className="py-1 pr-3">price</th>
                    <th className="py-1">status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_LIMIT).map((row) => (
                    <tr key={row.slug} className="border-b last:border-0">
                      <td className="py-1 pr-3">{row.name}</td>
                      <td className="py-1 pr-3">{row.slug}</td>
                      <td className="py-1 pr-3">{formatPrice(row.price)}</td>
                      <td className="py-1">
                        {row.status ? productStatusLabel(row.status) : 'ตามเดิม / แบบร่าง'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > PREVIEW_LIMIT && (
                <p className="mt-2 text-sm text-muted-foreground">
                  แสดง {PREVIEW_LIMIT} จาก {rows.length} รายการ
                </p>
              )}
            </div>
          )}
          <div>
            <Button onClick={runImport} disabled={rows.length === 0 || importProducts.isPending}>
              {progress
                ? `กำลังนำเข้า ${progress.done}/${progress.total}…`
                : `ยืนยันนำเข้า ${rows.length} รายการ`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
          <p className="font-medium">นำเข้าเสร็จสิ้น</p>
          <p>เพิ่มใหม่ {result.inserted} รายการ · อัปเดต {result.updated} รายการ</p>
          {result.failures.length > 0 && (
            <>
              <p className="font-medium text-destructive">
                ไม่สำเร็จ {result.failures.length} รายการ
              </p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {result.failures.slice(0, PREVIEW_LIMIT).map((failure) => (
                  <li key={failure.slug}>
                    {failure.slug}: {failure.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
