// 404 for URLs that match no route (the app has two root layouts, game and admin, so none of them can render it).
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Not found · GUESSLOCK", robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="grain flex min-h-dvh items-center justify-center bg-ink px-4 text-paper antialiased">
        <main className="deco max-w-md rounded-[3px] p-8 text-center">
          <p className="text-2xl tracking-[0.2em] text-brass">GUESSLOCK</p>
          <h1 className="mt-4 text-3xl">No such door</h1>
          <p className="mt-2 text-ash">There is nothing behind this keyhole.</p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-[3px] border border-ecto/60 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20">Back to the Vault</Link>
        </main>
      </body>
    </html>
  );
}
