import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Limelight, Noto_Emoji, Spectral } from "next/font/google";
import "../globals.css";
import { GameProvider } from "@/components/GameProvider";
import { Footer, Header, Onboarding } from "@/components/Chrome";
import { config } from "@/lib/config";
import { nextResetAt } from "@/lib/time";
import { todayDate } from "@/lib/day";

// "Today" depends on the request time: never prerender.
export const dynamic = "force-dynamic";

const limelight = Limelight({ weight: "400", subsets: ["latin"], variable: "--font-limelight", display: "swap" });
const spectral = Spectral({ weight: ["400", "500", "600"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-spectral", display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });
const notoEmoji = Noto_Emoji({ weight: "400", variable: "--font-noto-emoji", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "GUESSLOCK — Pick today's lock", template: "%s · GUESSLOCK" },
  description: "A daily Deadlock guessing game. 13 locks, one answer each, every day.",
  metadataBase: new URL(`https://${config.siteUrl}`),
};

export const viewport: Viewport = { themeColor: "#0e0d0b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const today = todayDate(now);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(now);
  return (
    <html lang="en" className={`${limelight.variable} ${spectral.variable} ${plexMono.variable} ${notoEmoji.variable}`}>
      <body className="grain flex min-h-dvh flex-col antialiased">
        <GameProvider today={today}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-ink focus:p-2">Skip to content</a>
          <Header dateLabel={dateLabel} nextReset={nextResetAt(now, config.timezone).getTime()} />
          <main id="main" className="flex-1">{children}</main>
          <Footer />
          <Onboarding />
        </GameProvider>
      </body>
    </html>
  );
}
