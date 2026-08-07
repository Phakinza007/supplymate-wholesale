import { useState, type ChangeEvent } from 'react'
import { useProductImages, useProductImageMutations } from '@/core/admin/useProductImages'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { getErrorMessage } from '@/lib/getErrorMessage'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif'

export function ProductImagesPanel({ productId }: { productId: string }) {
  const { data: images, isLoading } = useProductImages(productId)
  const { uploadImage, deleteImage } = useProductImageMutations(productId)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Image must be under 5MB.')
      e.target.value = ''
      return
    }
    try {
      await uploadImage.mutateAsync(file)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to upload image.'))
    }
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Images</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {images?.map((image) => (
          <div key={image.id} className="relative h-24 w-24 overflow-hidden rounded-md border">
            <img
              src={resolveImageUrl(image.storage_path)}
              alt={image.alt ?? ''}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() =>
                deleteImage.mutate(image, {
                  onError: (err) => setError(getErrorMessage(err, 'Failed to delete image.')),
                })
              }
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
              aria-label="Delete image"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        onChange={handleFileChange}
        disabled={uploadImage.isPending}
      />
    </div>
  )
}
