import MarketingLanding from "@/components/marketing-landing";
import JsonLd from "@/components/json-ld";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { productLd } from "@/lib/structured-data";

export const metadata = pageMeta(HOME_TITLE, HOME_DESCRIPTION, "/");

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <>
      <JsonLd data={productLd()} />
      <MarketingLanding />
    </>
  );
}
