import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Limelight, Noto_Emoji, Spectral } from "next/font/google";
import "../globals.css";
import { GameProvider } from "@/components/GameProvider";
import { GUEST_COOKIE } from "@/lib/guest";
import { Footer, Header, Onboarding } from "@/components/Chrome";
import { GuestBanner, GuestGate } from "@/components/GuestGate";
import { config } from "@/lib/config";
import { nextResetAt } from "@/lib/time";
import { todayDate } from "@/lib/day";
import { cookies } from "next/headers";
import { authConfigured, currentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { COSMETIC_BY_KEY } from "@/lib/market/catalog";
import { VAULT_UNITS } from "@/locks.config";

// "Today" depends on the request time: never prerender.
export const dynamic = "force-dynamic";

const limelight = Limelight({ weight: "400", subsets: ["latin"], variable: "--font-limelight", display: "swap" });
const spectral = Spectral({ weight: ["400", "500", "600"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-spectral", display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });
const notoEmoji = Noto_Emoji({ weight: "400", variable: "--font-noto-emoji", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "GUESSLOCK — Pick today's lock", template: "%s · GUESSLOCK" },
  description: `A daily Deadlock guessing game. ${VAULT_UNITS.length} locks every day: guessing games, Omens from real matches, sorting tables and more.`,
  metadataBase: new URL(`https://${config.siteUrl}`),
  openGraph: { type: "website", siteName: "GUESSLOCK", title: "GUESSLOCK — a daily Deadlock guessing game", description: "A new set of locks every day: guess the hero, item or ability, read the Omens, sort the tables. One shared puzzle for everyone.", locale: "en_GB" },
  twitter: { card: "summary", title: "GUESSLOCK", description: "A daily Deadlock guessing game." },
};

export const viewport: Viewport = { themeColor: "#0e0d0b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const today = todayDate(now);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(now);
  const [sessionUser, jar] = await Promise.all([currentUser(), cookies()]);
  const user = sessionUser ? { id: sessionUser.id, name: sessionUser.name || "Keeper" } : null;
  // The Black Market: an equipped Vault theme recolours the whole site for its owner.
  const themeKey = sessionUser ? (await db.profile.findUnique({ where: { userId: sessionUser.id }, select: { equippedTheme: true } }).catch(() => null))?.equippedTheme : null;
  const theme = themeKey ? COSMETIC_BY_KEY[themeKey]?.value : undefined;
  return (
    <html lang="en" className={`${limelight.variable} ${spectral.variable} ${plexMono.variable} ${notoEmoji.variable}`}>
      {/* Browser extensions add classes to <body> before hydration (e.g. "vc-init"). */}
      <body className="grain flex min-h-dvh flex-col antialiased" data-vault-theme={theme} suppressHydrationWarning>
        <GameProvider today={today} user={user} guest={jar.get(GUEST_COOKIE)?.value === "1"} accounts={authConfigured()}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-ink focus:p-2">Skip to content</a>
          <Header dateLabel={dateLabel} nextReset={nextResetAt(now, config.timezone).getTime()} />
          <GuestBanner />
          <main id="main" className="flex-1">{children}</main>
          <Footer />
          <Onboarding />
          <GuestGate />
        </GameProvider>
      </body>
    </html>
  );
}
