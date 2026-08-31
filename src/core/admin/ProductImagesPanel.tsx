import { useState, type ChangeEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useProductImages, useProductImageMutations } from '@/core/admin/useProductImages'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif'

export function ProductImagesPanel({ productId }: { productId: string }) {
  const { data: images, isLoading } = useProductImages(productId)
  const { uploadImage, deleteImage } = useProductImageMutations(productId)
  const [error, setError] = useState<string | null>(null)
  // Deleting drops the row and then the storage object, so there is no undo to
  // offer. Irreversible earns friction: confirm in place rather than a dialog,
  // matching the list-or-form convention used elsewhere in the admin.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
      e.target.value = ''
      return
    }
    try {
      await uploadImage.mutateAsync(file)
    } catch (err) {
      setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
    }
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">รูปสินค้า</h2>

      {error && <Alert tone="error" title="จัดการรูปไม่สำเร็จ">{error}</Alert>}

      {isLoading && (
        <div className="flex gap-3">
          <Skeleton className="size-24" />
          <Skeleton className="size-24" />
        </div>
      )}

      {!isLoading && images?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีรูป — รูปแรกจะถูกใช้เป็นรูปหลักในหน้าแคตตาล็อก
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {images?.map((image) => (
          <div
            key={image.id}
            className="relative size-24 overflow-hidden rounded-md border border-border bg-muted"
          >
            <img
              src={resolveImageUrl(image.storage_path)}
              alt={image.alt ?? ''}
              className="h-full w-full object-cover"
            />
            {confirmingId === image.id ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-card/95 p-1.5">
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full text-xs"
                  onClick={() => {
                    setConfirmingId(null)
                    deleteImage.mutate(image, {
                      onError: (err) => setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง')),
                    })
                  }}
                >
                  ลบเลย
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => setConfirmingId(null)}
                >
                  ไม่ลบ
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingId(image.id)}
                aria-label="ลบรูปนี้"
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-md bg-card/90 text-destructive transition-colors hover:bg-card"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        onChange={handleFileChange}
        disabled={uploadImage.isPending}
        aria-label="เลือกไฟล์รูปสินค้า"
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-semibold"
      />
    </div>
  )
}
