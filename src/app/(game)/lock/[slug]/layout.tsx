import { notFound } from "next/navigation";
import { getLock, SEANCE_BOXES } from "@/locks.config";

// The slug is checked here, above the page's loading boundary, so an unknown lock answers with a real 404 status
// (a notFound() inside the streamed page could only send 200).
export default async function LockLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getLock(slug) && !(slug in SEANCE_BOXES)) notFound();
  return children;
}
