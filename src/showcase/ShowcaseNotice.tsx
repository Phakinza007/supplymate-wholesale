interface ShowcaseNoticeProps {
  id?: string
}

export function ShowcaseNotice({ id }: ShowcaseNoticeProps) {
  return (
    <p id={id} role="note" className="showcase-demo-notice">
      <strong>Concept demo — ไม่รับคำสั่งซื้อจริง</strong>
      <span>ใช้ข้อมูลตัวอย่างในเครื่องเท่านั้น</span>
    </p>
  )
}
