import { requireUser } from "@/lib/auth";
import { MobileMoreLinks, Nav } from "@/components/nav";
import { signOut } from "@/app/actions/settings";

export default async function CrmLayout({ children }: LayoutProps<"/">) {
  const { supabase, email } = await requireUser();
  const { count } = await supabase.from("drafts").select("id", { count: "exact", head: true }).eq("status", "pending_approval");
  return (
    <div className="min-h-screen md:pl-56">
      <Nav pendingDrafts={count ?? 0} />
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <div className="mb-2 flex items-center justify-end gap-3 text-xs text-muted">
          <span className="truncate">{email}</span>
          <form action={signOut}>
            <button className="underline">Sign out</button>
          </form>
        </div>
        <MobileMoreLinks />
        {children}
      </div>
    </div>
  );
}
