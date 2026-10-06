import MarketingLanding from "@/components/marketing-landing";
import JsonLd from "@/components/json-ld";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { homeFaqLd, organizationLd, productLd } from "@/lib/structured-data";

export const metadata = pageMeta(HOME_TITLE, HOME_DESCRIPTION, "/");

export default async function HomePage({ searchParams }: { searchParams: Promise<{ demoError?: string; focus?: string }> }) {
  const { demoError, focus } = await searchParams;
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={productLd()} />
      <JsonLd data={homeFaqLd} />
      <MarketingLanding demoError={demoError} focus={focus} />
    </>
  );
}
