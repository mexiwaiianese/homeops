import MarketingLanding from "@/components/marketing-landing";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ demoError?: string }> }) {
  const { demoError } = await searchParams;
  return <MarketingLanding demoError={demoError} />;
}
