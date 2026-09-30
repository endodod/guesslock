import { redirect } from "next/navigation";
import { SignInForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth/server";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { next } = await searchParams;
  return <SignInForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}
