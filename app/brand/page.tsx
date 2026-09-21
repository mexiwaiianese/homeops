import BrandLockup from "@/components/brand-lockup";
import BrandMark from "@/components/brand-mark";
import BrandIcon, { type BrandIconName } from "@/components/brand-icon";

const colors = [
  { name: "Navy", hex: "#1A3E62", token: "--navy" },
  { name: "Teal", hex: "#008C99", token: "--teal" },
  { name: "Paper", hex: "#F3F4F6", token: "--bg" },
  { name: "White", hex: "#FFFFFF", token: "--card" },
  { name: "Coral", hex: "#E65A4F", token: "--red" },
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
        <p className="eyebrow">HOMEOPS IDENTITY</p>
        <BrandLockup artwork="lockup" />
        <p className="brandKitLead">Navy for the house. Teal for the work that moves it forward. Built for people who run properties—not a marketplace.</p>
      </section>

      <section className="brandKitGrid">
        <article className="panel">
          <p className="eyebrow">LOCKUP</p>
          <h2>Primary logo</h2>
          <img className="brandOfficial" src="/brand/homeops-lockup-light.png" alt="HomeOps horizontal lockup" />
          <div className="brandSpecimen dark">
            <BrandLockup artwork="lockup" />
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">MARK</p>
          <h2>App icon</h2>
          <div className="brandMarkRow">
            <BrandMark />
            <span className="brandMark brandMarkLg">
              <img src="/brand/homeops-app-icon.png" alt="" width={64} height={64} />
            </span>
            <p>Use the supplied app icon at small sizes: favicon, app icon, avatars. Do not redraw it.</p>
          </div>
          <img className="brandOfficial stacked" src="/brand/homeops-lockup-stacked.png" alt="HomeOps stacked lockup" />
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
        <h2>Plus Jakarta Sans + Inter</h2>
        <img className="brandOfficial wordmarkBoard" src="/brand/homeops-wordmark-tagline.png" alt="HomeOps wordmark with Rental Home OS tagline" />
        <p>Logo and display: Plus Jakarta Sans Bold / SemiBold / Medium. Product UI: Inter Regular, Italic, and Medium. Ops is always teal.</p>
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

      <section className="panel">
        <p className="eyebrow">SOURCE BOARD</p>
        <h2>Official artwork</h2>
        <img className="brandBoard" src="/brand/homeops-brand-board.jpg" alt="HomeOps brand board" />
      </section>
    </main>
  );
}
