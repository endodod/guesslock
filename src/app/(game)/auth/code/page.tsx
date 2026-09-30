import { redirect } from "next/navigation";
import { CodeForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth/server";

export const metadata = { title: "Sign in with a code", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { next } = await searchParams;
  return <CodeForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}
