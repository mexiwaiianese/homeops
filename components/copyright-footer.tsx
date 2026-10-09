"use client";

export default function CopyrightFooter() {
  return (
    <footer className="siteCopyright">
      <p suppressHydrationWarning>© {new Date().getFullYear()} DBX DEV</p>
    </footer>
  );
}
