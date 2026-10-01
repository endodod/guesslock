import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { inviterName } from "@/lib/market/earn";
import { InviteLanding } from "@/components/InviteLanding";

export const metadata = { title: "You're invited", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const from = await inviterName(decodeURIComponent(token));
  if (!from) notFound();
  const user = await currentUser();
  return <InviteLanding token={decodeURIComponent(token)} from={from.name} signedIn={!!user} self={user?.id === from.id} />;
}
