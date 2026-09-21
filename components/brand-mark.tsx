export default function BrandMark({ alt = "HomeOps" }: { alt?: string }) {
  return (
    <span className="brandMark">
      <img src="/brand/homeops-app-icon.png" alt={alt} width={38} height={38} />
    </span>
  );
}
