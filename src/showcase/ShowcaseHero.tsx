import { Link } from 'react-router-dom'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

export function ShowcaseHero() {
  return (
    <section className="wholesale-hero" aria-labelledby="showcase-hero-title">
      <div className="wholesale-hero__content">
        <p className="wholesale-hero__eyebrow">SUPPLYMATE WHOLESALE</p>
        <h1 id="showcase-hero-title">ของใช้ร้านอาหารและคาเฟ่ สั่งเป็นลัง ส่งตรงถึงร้าน</h1>
        <p className="wholesale-hero__copy">
          เลือกบรรจุภัณฑ์และอุปกรณ์หน้าร้าน พร้อมดูจำนวนต่อหน่วยและขั้นต่ำก่อนเพิ่มลงตะกร้า
        </p>
        <Link to="/shop" className="wholesale-hero__action">
          เลือกดูแคตตาล็อก
        </Link>
      </div>
      <img
        src={toShowcaseAssetUrl('/images/supplymate/cups-lids.png')}
        alt="แก้วพลาสติกใสและฝาโดมสำหรับร้านเครื่องดื่ม"
        className="wholesale-hero__image"
      />
    </section>
  )
}
