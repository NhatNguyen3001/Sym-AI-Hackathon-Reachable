"use client";
import { useTheme } from "@/components/theme/ThemeProvider";

/** Wordmark from the light and night logo files. One image stays in the accessibility tree. */
export function LogoImage({ className = "h-auto w-[168px]" }: { className?: string }) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <img
      src={dark ? "/brand/reachable-dark.png" : "/brand/reachable-light.png"}
      alt="Reachable. Reach anywhere."
      width={512}
      height={512}
      className={className}
      suppressHydrationWarning
    />
  );
}
