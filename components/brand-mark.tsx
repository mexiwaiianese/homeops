export default function BrandMark({ alt = "portonOS" }: { alt?: string }) {
  return (
    <span className="brandMark">
      <img src="/brand/portonos-mark.png" alt={alt} width={38} height={38} />
    </span>
  );
}
