import { Link } from 'react-router-dom'
import { demoCategories } from '@/demo/catalogue'

export function ShowcaseFooter() {
  return (
    <footer className="showcase-footer">
      <div>
        <p className="showcase-footer__eyebrow">SUPPLYMATE WHOLESALE</p>
        <p className="showcase-footer__statement">Concept demo — ไม่รับคำสั่งซื้อจริง</p>
        <p className="showcase-footer__local-data">แสดงข้อมูลตัวอย่างจากเครื่องนี้เท่านั้น</p>
      </div>
      <nav aria-label="หมวดสินค้า" className="showcase-footer__categories">
        <p>หมวดสินค้า</p>
        <ul>
          {demoCategories.map((category) => (
            <li key={category.slug}>
              <Link to={`/shop?category=${encodeURIComponent(category.slug)}`}>{category.name}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}
