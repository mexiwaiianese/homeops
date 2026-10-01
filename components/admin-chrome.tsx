import BrandLockup from "@/components/brand-lockup";

export default function AdminChrome({
  title,
  children,
  active,
}: {
  title: string;
  children: React.ReactNode;
  active: "packages" | "organizations";
}) {
  return (
    <main className="vendorShell adminShell">
      <aside className="finSide">
        <BrandLockup href="/admin/packages" className="finBrand" />
        <nav>
          <a className={active === "packages" ? "finNav active" : "finNav"} href="/admin/packages">Packages</a>
          <a className={active === "organizations" ? "finNav active" : "finNav"} href="/admin/organizations">Organizations</a>
          <a className="finNav" href="/vendors">Vendor board</a>
          <a className="finNav" href="/admin/login">Admin home</a>
        </nav>
        <div className="portfolio">
          <small>PLATFORM</small>
          <strong>{title}</strong>
          <span>Feature flags for packages and individual orgs</span>
        </div>
      </aside>
      <section className="vendorContent">{children}</section>
    </main>
  );
}
