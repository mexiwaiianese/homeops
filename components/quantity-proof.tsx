import { quantityProof } from "@/lib/public-site";

export default function QuantityProof() {
  if (!quantityProof) return null;
  return (
    <section className="marketingProof" aria-label="Who uses portonOS">
      <p>
        <strong>{quantityProof.workspaces.toLocaleString("en-US")} workspaces</strong>
        {" "}managing {quantityProof.homes.toLocaleString("en-US")} homes
      </p>
      {quantityProof.logos.length > 0 && (
        <ul className="marketingLogos">
          {quantityProof.logos.map((logo) => (
            <li key={logo.name}><img src={logo.src} alt={logo.name} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
