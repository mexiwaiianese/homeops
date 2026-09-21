export type BrandIconName = "listing" | "applications" | "rent" | "maintenance" | "tenants";

const src: Record<BrandIconName, string> = {
  listing: "/brand/icons/listing-properties.png",
  applications: "/brand/icons/applications.png",
  rent: "/brand/icons/rent-collection.png",
  maintenance: "/brand/icons/maintenance-requests.png",
  tenants: "/brand/icons/tenant-satisfaction.png",
};

export default function BrandIcon({
  name,
  className = "brandIcon",
  title,
}: {
  name: BrandIconName;
  className?: string;
  title?: string;
}) {
  return <img className={className} src={src[name]} alt={title || ""} width={24} height={24} />;
}
