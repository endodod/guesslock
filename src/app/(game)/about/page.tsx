import { t } from "@/lib/i18n/en";

export const metadata = { title: "About" };

export default function AboutPage() {
  const a = "text-brass underline underline-offset-4";
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 text-paper/90">
      <h1 className="font-display text-3xl text-brass">About GUESSLOCK</h1>
      <p>GUESSLOCK is a fan-made daily guessing game for Valve&apos;s Deadlock: 13 small puzzles a day about the game&apos;s heroes and shop items.</p>
      <h2 className="font-display pt-2 text-xl text-paper">Credits</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Game data, images and match analytics: <a className={a} href="https://deadlock-api.com" target="_blank" rel="noreferrer">deadlock-api.com</a>, a community project.
        </li>
        <li>
          Voice line transcriptions for The Echo: the <a className={a} href="https://deadlock.wiki" target="_blank" rel="noreferrer">Deadlock Wiki</a> (per-hero voice line pages),
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
      <p>GUESSLOCK is non-commercial. It stores your progress only in your own browser and uses no accounts or tracking.</p>
    </div>
  );
}
