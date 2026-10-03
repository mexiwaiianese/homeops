import MarketingLanding from "@/components/marketing-landing";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ demoError?: string; focus?: string }> }) {
  const { demoError, focus } = await searchParams;
  return <MarketingLanding demoError={demoError} focus={focus} />;
}
