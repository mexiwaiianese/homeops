import { founder } from "@/lib/public-site";

export default function FounderBlock() {
  if (!founder) return null;
  return (
    <section className="founderBlock">
      <img src={founder.photoSrc} alt={founder.name} width={96} height={96} />
      <div>
        <h2>Who builds portonOS</h2>
        <p>portonOS is built by {founder.name}, who {founder.background}</p>
        <p>Why I built it: {founder.whyBuilt}</p>
        <p><a href={founder.profileUrl}>Profile</a></p>
      </div>
    </section>
  );
}
