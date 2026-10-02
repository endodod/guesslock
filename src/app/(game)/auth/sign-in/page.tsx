import { safeNextPath } from "@/lib/auth/redirect";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth/server";
import { config } from "@/lib/config";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { next } = await searchParams;
  return <SignInForm next={safeNextPath(next)} adminLink={config.adminDebug} />;
}
