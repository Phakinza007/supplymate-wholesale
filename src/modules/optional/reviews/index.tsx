import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'
import { useProfile } from '@/core/auth/useProfile'
import { useProductReviews } from '@/modules/optional/reviews/useProductReviews'
import { useReviewEligibility } from '@/modules/optional/reviews/useReviewEligibility'
import { useReviewMutations } from '@/modules/optional/reviews/useReviewMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function Reviews({ productId }: { productId: string }) {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const { data: reviews, isLoading, isError } = useProductReviews(productId)
  const ownReview = reviews?.find((r) => r.user_id === user?.id)
  const { data: eligible } = useReviewEligibility(productId, ownReview ? undefined : user?.id)
  const { submitReview, setReviewActive } = useReviewMutations(productId)

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [hideErrors, setHideErrors] = useState<Record<string, string>>({})
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (ownReview) {
      setRating(ownReview.rating)
      setComment(ownReview.comment ?? '')
    }
  }, [ownReview])

  const formRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && searchParams.get('review') === '1') {
        node.scrollIntoView({ behavior: 'smooth' })
      }
    },
    [searchParams],
  )

  if (isLoading) return null
  if (isError) return <p className="text-sm text-destructive">โหลดรีวิวไม่สำเร็จ</p>

  const activeReviews = (reviews ?? []).filter((r) => r.is_active)
  const average =
    activeReviews.length > 0
      ? activeReviews.reduce((sum, r) => sum + r.rating, 0) / activeReviews.length
      : null
  const canShowForm = !!user && (!!ownReview || eligible === true)

  return (
    <div className="flex flex-col gap-4 border-t pt-6">
      <h2 className="text-[length:var(--text-app-section)] font-bold tracking-tight">รีวิว</h2>
      {average !== null ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          {average.toFixed(1)} ★ · {activeReviews.length} รีวิว
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">ยังไม่มีรีวิว</p>
      )}

      <ul className="flex flex-col gap-3">
        {(reviews ?? []).map((r) => (
          <li key={r.id} className={'rounded-md border p-3 text-sm' + (r.is_active ? '' : ' opacity-50')}>
            <div className="flex items-center justify-between">
              <span>{'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}</span>
              <span className="text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString('th-TH')}
                {!r.is_active && ' · ซ่อนอยู่'}
              </span>
            </div>
            {r.comment && <p className="mt-1">{r.comment}</p>}
            {isAdmin && (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={setReviewActive.isPending}
                  onClick={() => {
                    setHideErrors((prev) => {
                      const next = { ...prev }
                      delete next[r.id]
                      return next
                    })
                    setReviewActive.mutate(
                      { reviewId: r.id, isActive: !r.is_active },
                      {
                        onError: (err) =>
                          setHideErrors((prev) => ({
                            ...prev,
                            [r.id]: getErrorMessage(err, 'ลองใหม่อีกครั้ง'),
                          })),
                      },
                    )
                  }}
                >
                  {r.is_active ? 'ซ่อน' : 'แสดง'}
                </Button>
                {hideErrors[r.id] && (
                  <p className="mt-1 text-sm text-destructive">{hideErrors[r.id]}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canShowForm && (
        <div ref={formRef} className="flex flex-col gap-3 rounded-md border p-4">
          <h3 className="text-sm font-semibold">{ownReview ? 'แก้ไขรีวิวของคุณ' : 'เขียนรีวิว'}</h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`ให้ ${n} ดาว`}
                onClick={() => setRating(n)}
                className="text-xl"
              >
                {n <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="ความเห็นเพิ่มเติม (ไม่บังคับ)"
            aria-label="ความเห็นเพิ่มเติม"
            className="min-h-20 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none"
          />
          {formError && <Alert tone="error" title="ส่งรีวิวไม่สำเร็จ">{formError}</Alert>}
          <Button
            disabled={rating === 0 || submitReview.isPending}
            onClick={async () => {
              setFormError(null)
              try {
                await submitReview.mutateAsync({ rating, comment })
              } catch (err) {
                setFormError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
              }
            }}
          >
            {submitReview.isPending ? 'กำลังส่ง' : ownReview ? 'อัปเดตรีวิว' : 'ส่งรีวิว'}
          </Button>
        </div>
      )}
    </div>
  )
}
