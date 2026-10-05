import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { activeEntities } from "@/lib/seance/library";
import { facetOptions } from "@/lib/community/service";
import { CommunityEditor } from "@/components/community/CommunityEditor";
import { Icon } from "@/components/ui";

export const metadata = { title: "Make a puzzle — Community" };

export default async function NewCommunityPuzzlePage() {
  const user = await currentUser();
  if (!user) redirect("/auth/sign-in?next=/community/new");
  const [hero, item, ability, grid] = await Promise.all([activeEntities("hero"), activeEntities("item"), activeEntities("ability"), facetOptions()]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:py-8">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/community" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-brass/30 text-brass hover:border-brass" aria-label="All community puzzles">
          <Icon name="back" />
        </Link>
        <div>
          <p className="smallcaps text-xs text-cursed">Community</p>
          <h1 className="font-display text-2xl text-paper md:text-3xl">Make a puzzle</h1>
        </div>
      </div>
      <CommunityEditor entities={{ hero, item, ability }} facets={grid.facets} heroes={grid.heroes} />
    </div>
  );
}
