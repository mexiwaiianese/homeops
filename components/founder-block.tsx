import { founderIdentity, founderSign, founderStory } from "@/lib/public-site";

export default function FounderBlock() {
  return (
    <section className="founderBlock">
      {founderIdentity?.photoSrc ? (
        <img className="founderPortrait" src={founderIdentity.photoSrc} alt={founderIdentity.name} width={96} height={96} />
      ) : null}
      <div>
        <h2>{founderIdentity?.name ?? "Why I built this"}</h2>
        {founderStory.map((part, index) => {
          if (part.kind !== "tire") {
            const tireAt = founderStory.findIndex((row) => row.kind === "tire");
            if (tireAt !== -1 && index > tireAt) return null;
            return <p key={part.text}>{part.text}</p>;
          }
          const after = founderStory.slice(index + 1);
          return (
            <div className="founderTire" key={part.src}>
              <img src={part.src} alt={part.alt} width={part.width} height={part.height} />
              <p>{part.text}</p>
              {after.map((row) => (row.kind === "text" ? <p key={row.text}>{row.text}</p> : null))}
              <p className="founderSign">{founderSign}</p>
            </div>
          );
        })}
        {founderIdentity?.profileUrl ? (
          <p><a href={founderIdentity.profileUrl}>LinkedIn</a></p>
        ) : null}
      </div>
    </section>
  );
}
