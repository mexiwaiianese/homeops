const artworkSrc = {
  lockup: "/brand/portonos-wordmark.png",
  stacked: "/brand/portonos-lockup.png",
  wordmark: "/brand/portonos-wordmark.png",
} as const;

type BrandLockupProps = {
  href?: string;
  className?: string;
  artwork?: keyof typeof artworkSrc;
};

export default function BrandLockup({
  href,
  className = "",
  artwork = "lockup",
}: BrandLockupProps) {
  const classes = ["brand", "brandLockup", className].filter(Boolean).join(" ");
  const inner = (
    <>
      <img className="brandArtwork brandLockupImg" src={artworkSrc[artwork]} alt="portonOS" />
      <img className="brandMarkImg" src="/brand/portonos-mark.png" alt="" />
    </>
  );
  if (href) {
    return (
      <a className={classes} href={href}>
        {inner}
      </a>
    );
  }
  return <div className={classes}>{inner}</div>;
}
