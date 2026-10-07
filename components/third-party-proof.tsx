import { thirdPartyMentions } from "@/lib/public-site";

export default function ThirdPartyProof() {
  if (!thirdPartyMentions.length) return null;
  return (
    <aside className="proofStrip" aria-label="Mentions">
      {thirdPartyMentions.map((mention) => (
        <p key={mention.url}>
          <time dateTime={mention.date}>{mention.date}</time>
          {" "}
          <a href={mention.url}>{mention.source}</a>
          {": "}
          {mention.label}
        </p>
      ))}
    </aside>
  );
}
