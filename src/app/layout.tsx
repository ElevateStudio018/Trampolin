import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getActor } from "@/server/auth/current";
import { hasRole } from "@/server/actor";
import { Container, buttonClass } from "@/components/ui";
import { DesktopNav, MobileTabBar, type NavItem } from "@/components/nav";
import { signOutAction } from "./actions-auth";

export const metadata: Metadata = {
  title: { default: "Trampolin — trampoline trick book", template: "%s · Trampolin" },
  description: "A source-checked trampoline trick book with personal progress tracking, a grounded assistant and a private video library.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink" aria-label="Trampolin home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect x="2" y="18" width="28" height="4" rx="2" fill="var(--pad)" />
        <path d="M6 22v6M26 22v6" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="16" cy="8" r="4.5" fill="var(--accent)" />
      </svg>
      <span className="text-[17px]">Trampolin</span>
    </Link>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const items: NavItem[] = [
    { href: "/tricks", label: "Trick Book", icon: "book" },
    { href: "/collection", label: "Collection", icon: "star" },
    { href: "/videos", label: "Videos", icon: "video" },
    { href: "/assistant", label: "Assistant", icon: "chat" },
    { href: "/community", label: "Community", icon: "people" },
  ];
  const withAnimations: NavItem[] = [items[0]!, { href: "/animate", label: "3D", icon: "play" }, ...items.slice(1)];
  const desktopItems: NavItem[] = hasRole(actor, "reviewer") ? [...withAnimations, { href: "/studio", label: "Studio", icon: "studio" }] : withAnimations;

  return (
    <html lang="en">
      <body className="min-h-dvh pb-20 md:pb-0">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <Container className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <Wordmark />
              <DesktopNav items={desktopItems} />
            </div>
            <div className="flex items-center gap-2">
              {actor ? (
                <>
                  {hasRole(actor, "reviewer") && (
                    <Link href="/studio" className={buttonClass("ghost", "sm", "md:hidden")}>
                      Studio
                    </Link>
                  )}
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-ink-2 hover:bg-surface-2"
                    aria-label={`Account settings for ${actor.displayName}`}
                  >
                    <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                      {actor.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hidden max-w-32 truncate sm:inline">{actor.displayName}</span>
                  </Link>
                  <form action={signOutAction}>
                    <button className={buttonClass("ghost", "sm")}>Sign out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className={buttonClass("ghost", "sm")}>
                    Sign in
                  </Link>
                  <Link href="/signup" className={buttonClass("primary", "sm")}>
                    Join
                  </Link>
                </>
              )}
            </div>
          </Container>
        </header>
        <main id="main">{children}</main>
        <footer className="mt-16 border-t border-line py-8 text-sm text-muted">
          <Container className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <p>Trampolin is a reference, not coaching. Learn new skills only with a qualified coach and proper safety equipment.</p>
            <nav aria-label="Footer" className="flex gap-4">
              <Link href="/about" className="hover:text-ink">
                About the data
              </Link>
              <Link href="/explore" className="hover:text-ink">
                Explore
              </Link>
            </nav>
          </Container>
        </footer>
        <MobileTabBar items={items} />
      </body>
    </html>
  );
}
