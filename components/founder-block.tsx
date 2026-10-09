import Image from "next/image";
import { founderIdentity, founderSign, founderStory } from "@/lib/public-site";

export default function FounderBlock() {
  return (
    <section className="founderBlock">
      {founderIdentity?.photoSrc ? (
        <Image className="founderPortrait" src={founderIdentity.photoSrc} alt={founderIdentity.name} width={96} height={96} />
      ) : null}
      <div>
        <h2>{founderIdentity?.name ?? "Why I built this"}</h2>
        {founderStory.map((part, index) => {
          if (part.kind !== "tire") {
            const tireAt = founderStory.findIndex((row) => row.kind === "tire");
            if (tireAt !== -1 && index > tireAt) return null;
            if (part.kind !== "text") return null;
            return <p key={part.text}>{part.text}</p>;
          }
          const after = founderStory.slice(index + 1);
          return (
            <div className="founderTire" key={part.src}>
              <Image src={part.src} alt={part.alt} width={part.width} height={part.height} />
              <p>{part.text}</p>
              {after.map((row) => {
                if (row.kind === "portrait") {
                  return (
                    <Image
                      key={row.src}
                      className="founderPhoto"
                      src={row.src}
                      alt={row.alt}
                      width={row.width}
                      height={row.height}
                    />
                  );
                }
                if (row.kind === "text") return <p key={row.text}>{row.text}</p>;
                return null;
              })}
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
