import "../globals.css";
import "./admin.css";
import { isAdmin } from "@/lib/admin/auth";
import { config } from "@/lib/config";
import { LOCKS } from "@/locks.config";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "GUESSLOCK admin", robots: { index: false, follow: false } };

// Own root layout (no vault chrome): sidebar navigation + content area, themed by admin.css.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdmin();
  const locks = LOCKS.map((l) => ({ slug: l.slug, numeral: l.numeral, name: l.name, group: l.group, label: l.table?.label }));
  return (
    <html lang="en">
      <body suppressHydrationWarning className="admin-ui min-h-dvh text-[15px]">
        {authed ? (
          <>
            <AdminNav locks={locks} setup={config.adminSetup} />
            <main className="px-4 py-5 lg:ml-72 lg:px-8 lg:py-8">
              <div className="mx-auto max-w-[1400px]">{children}</div>
            </main>
          </>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
