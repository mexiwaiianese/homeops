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
          const portraitAt = after.findIndex((row) => row.kind === "portrait");
          const lead = portraitAt === -1 ? after : after.slice(0, portraitAt);
          const portrait = portraitAt === -1 ? null : after[portraitAt];
          const beside = portraitAt === -1 ? [] : after.slice(portraitAt + 1);
          return (
            <div className="founderTire" key={part.src}>
              <Image src={part.src} alt={part.alt} width={part.width} height={part.height} />
              <p>{part.text}</p>
              {lead.map((row) => (row.kind === "text" ? <p key={row.text}>{row.text}</p> : null))}
              {portrait?.kind === "portrait" ? (
                <div className="founderClose">
                  <Image
                    className="founderPhoto"
                    src={portrait.src}
                    alt={portrait.alt}
                    width={portrait.width}
                    height={portrait.height}
                  />
                  <div className="founderCopy">
                    {beside.map((row) => (row.kind === "text" ? <p key={row.text}>{row.text}</p> : null))}
                  </div>
                </div>
              ) : null}
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
