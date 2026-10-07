import Image from "next/image";
import { customerStories } from "@/lib/public-site";

export default function StoryProof() {
  if (!customerStories.length) return null;
  return (
    <section className="marketingStories" aria-label="Customers">
      <h2>From people running a portfolio on portonOS</h2>
      <div className="marketingRoleGrid">
        {customerStories.map((story) => (
          <figure key={story.name} className="marketingCard">
            {story.photoSrc ? <Image src={story.photoSrc} alt={story.name} width={64} height={64} /> : null}
            <blockquote>{story.quote}</blockquote>
            <figcaption>
              <strong>{story.name}</strong>
              {story.role ? <span>{story.role}</span> : null}
              {story.portfolioSize ? <span>{story.portfolioSize}</span> : null}
              {story.outcome ? <span>{story.outcome}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
