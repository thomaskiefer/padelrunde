import { Link } from "@tanstack/react-router";
import {
  SignInButton,
  useAuth,
  useClerk,
  useUser,
} from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";

export function AppHeader() {
  const { isSignedIn } = useAuth();

  return (
    <header className="bg-brand-navy py-3.5 shadow-lg relative z-10">
      <div className="mx-auto flex max-w-5xl px-4 items-center justify-between">
        <Link
          to="/"
          className="text-lg sm:text-xl font-display uppercase tracking-wider text-white hover:text-white/90 transition-colors"
        >
          PADELRUNDE
        </Link>
        {isSignedIn ? (
          <UserMenu />
        ) : (
          <SignInButton mode="modal">
            <Button variant="brandGhost" size="touchLg" className="border border-white/20">
              Anmelden
            </Button>
          </SignInButton>
        )}
      </div>
    </header>
  );
}

function UserMenu() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (!open) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items?.length) return;
        const focused = document.activeElement as HTMLElement;
        const idx = Array.from(items).indexOf(focused);
        const next = e.key === "ArrowDown"
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
        next.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [open]);

  const initials =
    user?.firstName?.[0] ??
    user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ??
    "?";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Benutzermenü"
        aria-expanded={open}
        aria-controls="user-menu"
        aria-haspopup="menu"
        className="w-11 h-11 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center text-white text-sm font-bold hover:bg-white/30 focus-visible:ring-[3px] focus-visible:ring-brand-red transition-colors overflow-hidden"
      >
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </button>
      {open && (
        <div role="menu" id="user-menu" className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-scale-in">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.fullName ?? user?.emailAddresses[0]?.emailAddress}
            </p>
          </div>
          <Button
            variant="ghost"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              openUserProfile();
            }}
            className="w-full text-left justify-start px-3 py-2 text-sm text-gray-700 rounded-none focus-visible:ring-brand-navy/50 min-h-[44px]"
          >
            Profil bearbeiten
          </Button>
          <Button
            variant="ghost"
            role="menuitem"
            tabIndex={-1}
            onClick={() => signOut()}
            className="w-full text-left justify-start px-3 py-2 text-sm text-brand-red rounded-none focus-visible:ring-brand-navy/50 min-h-[44px]"
          >
            Abmelden
          </Button>
        </div>
      )}
    </div>
  );
}
