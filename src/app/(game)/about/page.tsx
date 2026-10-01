import { t } from "@/lib/i18n/en";

export const metadata = { title: "About" };

export default function AboutPage() {
  const a = "text-brass underline underline-offset-4";
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 text-paper/90">
      <h1 className="font-display text-3xl text-brass">About GUESSLOCK</h1>
      <p>GUESSLOCK is a fan-made daily guessing game for Valve&apos;s Deadlock: 17 small puzzles a day: 14 about the game&apos;s heroes and shop items, and 3 Omens, where you predict what happens next in a real high-rank match. Omen matches and replay data come from deadlock-api.com.</p>
      <h2 className="font-display pt-2 text-xl text-paper">Credits</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Game data, images and match analytics (hosted by them): <a className={a} href="https://deadlock-api.com" target="_blank" rel="noreferrer">deadlock-api.com</a>, a community project.
        </li>
        <li>
          Voice line transcriptions for The Echo, The Utterance and The Colloquy, and the ability cast sounds of The Resonance: the <a className={a} href="https://deadlock.wiki" target="_blank" rel="noreferrer">Deadlock Wiki</a> (per-hero voice line and sound pages),
          licensed under <a className={a} href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>.
          Lines may have names blacked out; those adapted texts are shared under the same license.
        </li>
        <li>
          Fonts: Limelight, Spectral, IBM Plex Mono and Noto Emoji (Google Fonts). Color emoji option:{" "}
          <a className={a} href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">Twemoji</a> (CC BY 4.0).
        </li>
      </ul>
      <h2 className="font-display pt-2 text-xl text-paper">Disclaimer</h2>
      <p>{t.footer.disclaimer}</p>
      <h2 className="font-display pt-2 text-xl text-paper">Privacy</h2>
      <p>GUESSLOCK is non-commercial and uses no ads or tracking. Without an account, your progress stays in your own browser.</p>
      <p>
        Accounts are optional. If you create one, we store your email, your display name and the puzzles you play while signed in,
        so your progress follows you across devices and you can appear on the leaderboards. Sign-in is handled by Neon Auth.
        You can hide yourself from the leaderboards, download your data or delete your account at any time on your account page.
      </p>
    </div>
  );
}
