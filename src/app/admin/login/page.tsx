import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#1b2036,#0d0f18_70%)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[#b8913f]/50 bg-[#b8913f]/10">
            <svg viewBox="0 0 24 32" className="h-6 w-[1.1rem] text-[#b8913f]" aria-hidden>
              <circle cx="12" cy="11" r="7" fill="currentColor" />
              <path d="M8.5 15 6 30h12l-2.500-15z" fill="currentColor" />
            </svg>
          </span>
          <h1>GUESSLOCK admin</h1>
          <p className="mt-1 text-sm text-neutral-500">Enter the admin password to continue.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
