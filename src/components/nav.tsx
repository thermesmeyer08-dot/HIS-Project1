"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/queue", label: "Queue", icon: "✓" },
  { href: "/leads", label: "Leads", icon: "◎" },
  { href: "/partners", label: "Partners", icon: "⇄" },
  { href: "/contacts", label: "Contacts", icon: "☰" },
  { href: "/organizations", label: "Businesses", icon: "▦" },
  { href: "/data", label: "Import / export", icon: "⇅" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];
// Phone bottom bar shows the five most-used items.
const MOBILE = ["/", "/queue", "/leads", "/partners", "/settings"];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Nav({ pendingDrafts }: { pendingDrafts: number }) {
  const path = usePathname();
  const badge = (href: string) =>
    href === "/queue" && pendingDrafts > 0 ? (
      <span className="ml-auto rounded-full bg-accent px-1.5 text-xs font-semibold text-white dark:text-[#12161c]">{pendingDrafts}</span>
    ) : null;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-border bg-surface p-4 md:flex">
        <Link href="/" className="mb-6 block">
          <div className="text-sm font-semibold text-brand">Hermesmeyer</div>
          <div className="text-xs text-muted">Insurance Solutions · CRM</div>
        </Link>
        <nav className="flex flex-col gap-1">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cx(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                isActive(path, i.href) ? "bg-brand-soft font-medium text-brand" : "hover:bg-brand-soft",
              )}
            >
              <span aria-hidden className="w-4 text-center">{i.icon}</span>
              {i.label}
              {badge(i.href)}
            </Link>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {ITEMS.filter((i) => MOBILE.includes(i.href)).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cx(
              "relative flex flex-col items-center gap-0.5 py-2 text-[11px]",
              isActive(path, i.href) ? "font-semibold text-brand" : "text-muted",
            )}
          >
            <span aria-hidden className="text-lg leading-none">{i.icon}</span>
            {i.label}
            {i.href === "/queue" && pendingDrafts > 0 && (
              <span className="absolute right-[22%] top-1 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white dark:text-[#12161c]">
                {pendingDrafts}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** Secondary links on phones (items that don't fit in the bottom bar). */
export function MobileMoreLinks() {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto text-sm md:hidden">
      {ITEMS.filter((i) => !MOBILE.includes(i.href)).map((i) => (
        <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1">
          {i.label}
        </Link>
      ))}
    </div>
  );
}
