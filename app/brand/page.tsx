import BrandLockup from "@/components/brand-lockup";
import BrandMark from "@/components/brand-mark";
import BrandIcon, { type BrandIconName } from "@/components/brand-icon";

const colors = [
  { name: "Forest", hex: "#0A241C", token: "--forest" },
  { name: "Sage", hex: "#647C64", token: "--sage" },
  { name: "Gold", hex: "#C1915A", token: "--gold" },
  { name: "Cream", hex: "#F3D8B1", token: "--cream" },
  { name: "Paper", hex: "#F4F1EA", token: "--bg" },
];

const icons: Array<{ name: BrandIconName; label: string }> = [
  { name: "listing", label: "Listing Properties" },
  { name: "applications", label: "Applications" },
  { name: "rent", label: "Rent Collection" },
  { name: "maintenance", label: "Maintenance Requests" },
  { name: "tenants", label: "Tenant Satisfaction" },
];

export default function BrandPage() {
  return (
    <main className="brandKit">
      <section className="brandKitHero">
        <p className="eyebrow">PORTONOS IDENTITY</p>
        <BrandLockup artwork="stacked" />
        <p className="brandKitLead">Forest for the door. Sage for the work behind it. Gold for the handle you actually turn.</p>
      </section>

      <section className="brandKitGrid">
        <article className="panel">
          <p className="eyebrow">LOCKUP</p>
          <h2>Primary logo</h2>
          <img className="brandOfficial stacked" src="/brand/portonos-lockup.png" alt="portonOS lockup" />
          <div className="brandSpecimen dark">
            <BrandLockup artwork="wordmark" />
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">MARK</p>
          <h2>Door</h2>
          <div className="brandMarkRow">
            <BrandMark />
            <img className="brandDoor" src="/brand/portonos-mark.png" alt="" />
            <p>Use the supplied door at small sizes: favicon, app icon, collapsed navigation. Do not redraw it.</p>
          </div>
          <img className="brandOfficial" src="/brand/portonos-wordmark.png" alt="portonOS wordmark" />
        </article>
      </section>

      <section className="panel">
        <p className="eyebrow">COLOR</p>
        <h2>Palette</h2>
        <div className="brandSwatches">
          {colors.map((color) => (
            <div key={color.hex} className="brandSwatch">
              <i style={{ background: color.hex }} />
              <strong>{color.name}</strong>
              <span>{color.hex}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">TYPE</p>
        <h2>Cormorant Garamond + Montserrat Light</h2>
        <img className="brandOfficial wordmarkBoard" src="/brand/portonos-wordmark.png" alt="portonOS wordmark with tagline" />
        <p className="brandSerifSample">Everything behind every door.</p>
        <p className="brandSansSample">Montserrat Light — the operating desk</p>
        <p>Display and headlines: Cormorant Garamond. Product UI: Montserrat Light (300). The wordmark is the supplied artwork.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">UI ICONOGRAPHY</p>
        <h2>Product icons</h2>
        <div className="brandIconGrid">
          {icons.map((icon) => (
            <div key={icon.name} className="brandIconCard">
              <BrandIcon name={icon.name} title={icon.label} />
              <strong>{icon.label}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
