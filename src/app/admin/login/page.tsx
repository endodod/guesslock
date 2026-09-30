import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="mx-auto mt-24 max-w-sm rounded border border-neutral-300 bg-white p-6">
      <h1 className="mb-4 text-lg font-semibold">GUESSLOCK admin</h1>
      <LoginForm />
    </div>
  );
}
