const artworkSrc = {
  lockup: "/brand/homeops-lockup-light.png",
  stacked: "/brand/homeops-lockup-stacked.png",
  wordmark: "/brand/homeops-wordmark-tagline.png",
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
      <img className="brandArtwork brandLockupImg" src={artworkSrc[artwork]} alt="HomeOps" />
      <img className="brandMarkImg" src="/brand/homeops-app-icon.png" alt="" />
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
