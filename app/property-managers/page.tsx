import BrandLockup from "@/components/brand-lockup";

export default function PropertyManagersPage() {
  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">PROPERTY MANAGERS</p>
        <h1>Run the work from one desk.</h1>
        <p>HomeOps is for small property managers and landlords. The invoice you just opened is one bill. The desk is the rest of the work around it.</p>
        <ul className="planList">
          <li>Tenant requests open on the property, with the person who reported them.</li>
          <li>Send the job to vendors who do that work and compare their bids.</li>
          <li>Crew arrival, photos, and departure stay on the visit. The crew does not get a login to your books.</li>
          <li>Open work shows as an expected expense on the property and on the owner statement before the bill posts.</li>
        </ul>
        <a className="primary invoiceAdLink" href="/login">Open the property manager desk</a>
      </section>
    </main>
  );
}
