import type { Metadata } from "next";
import Script from "next/script";
import { Atkinson_Hyperlegible } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
});

const SHARE_TITLE = "Reachable: from the stop to the door";
const SHARE_TEXT = "Step-free trips across Sydney, with live lift status and plain-language guidance.";

export const metadata: Metadata = {
  metadataBase: new URL("https://reachable-five.vercel.app"),
  title: { template: "%s · Reachable", default: "Reachable" },
  description: "Step-free routes from the stop to the door, with live lift status and destination checks.",
  // What LinkedIn and other sites show when the link is shared.
  openGraph: {
    type: "website", title: SHARE_TITLE, description: SHARE_TEXT, url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "A step-free route from Macquarie University station to Waranara Library" }],
  },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_TEXT, images: ["/og.png"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${atkinson.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <Script id="reachable-theme" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("reachable-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`}
        </Script>
        <a href="#main"
          className="sr-only z-[2000] rounded-[12px] bg-primary px-4 py-3 font-bold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to main content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
