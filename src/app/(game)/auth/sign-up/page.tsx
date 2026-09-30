import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth/server";

export const metadata = { title: "Create account", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { next } = await searchParams;
  return <SignUpForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}
