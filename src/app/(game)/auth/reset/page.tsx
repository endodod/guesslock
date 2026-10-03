import { NewPasswordForm, ResetForm } from "@/components/AuthForms";

export const metadata = { title: "Reset password", robots: { index: false } };

/** Without a token: ask for a reset link. With one (the emailed link lands here): choose the new password. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token } = await searchParams;
  return token ? <NewPasswordForm token={token} /> : <ResetForm />;
}
