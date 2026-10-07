"use client";

import Image from "next/image";
import { useHomeHref } from "@/lib/home-href-client";

const artworkSrc = {
  lockup: "/brand/portonos-wordmark.png",
  stacked: "/brand/portonos-lockup.png",
  wordmark: "/brand/portonos-wordmark.png",
} as const;

type BrandLockupProps = {
  /** Shown before the session is known. Defaults to the public homepage. */
  href?: string;
  className?: string;
  artwork?: keyof typeof artworkSrc;
  /** Set false for print headers and specimens that should not be clickable. */
  link?: boolean;
};

/**
 * The portonOS lockup. Clicking it goes to the public homepage when nobody is signed in and to
 * the signed-in persona's default page otherwise (manager desk, owner portal, vendor desk, tenant
 * portal, or platform admin).
 */
export default function BrandLockup({
  href = "/",
  className = "",
  artwork = "lockup",
  link = true,
}: BrandLockupProps) {
  const home = useHomeHref(href);
  const classes = ["brand", "brandLockup", className].filter(Boolean).join(" ");
  const inner = (
    <>
      <Image
        className="brandArtwork brandLockupImg"
        src={artworkSrc[artwork]}
        alt="portonOS"
        width={320}
        height={96}
        sizes="(max-width: 900px) 160px, 180px"
        srcSet={`${artworkSrc[artwork]} 320w`}
      />
      <Image
        className="brandMarkImg"
        src="/brand/portonos-mark.png"
        alt="portonOS"
        width={62}
        height={62}
        sizes="62px"
        srcSet="/brand/portonos-mark.png 62w"
      />
    </>
  );
  if (link) {
    return (
      <a className={classes} href={home} aria-label="portonOS home">
        {inner}
      </a>
    );
  }
  return <div className={classes}>{inner}</div>;
}
