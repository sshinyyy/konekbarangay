"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type AppRole = "resident" | "staff" | "admin";

type Identity = {
  email: string | null;
  role: AppRole;
};

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    const supabase = getSupabaseClient();

    async function updateIdentity(accessToken: string | null) {
      if (!accessToken) {
        if (isCurrent) {
          setIdentity(null);
          setIsCheckingSession(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Identity lookup failed");
        const result = (await response.json()) as Identity;
        if (isCurrent) setIdentity(result);
      } catch {
        if (isCurrent) setIdentity(null);
      } finally {
        if (isCurrent) setIsCheckingSession(false);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      void updateIdentity(data.session?.access_token ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void updateIdentity(session?.access_token ?? null);
    });

    return () => {
      isCurrent = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    setIdentity(null);
    router.replace("/");
  }

  const navigation = identity?.role === "resident"
    ? [
        { href: "/resident/requests", label: "Document requests" },
        { href: "/resident/profile", label: "My profile" },
      ]
    : identity?.role === "staff" || identity?.role === "admin"
      ? [{ href: "/staff/requests", label: "Staff queue" }]
      : [{ href: "/", label: "Home" }];

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link aria-label="KoneBarangay home" className="brand" href="/">
          <span aria-hidden="true" className="brand__mark">K</span>
          <span className="brand__copy">
            <strong>KoneBarangay</strong>
            <span>Community services</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="site-nav">
          {navigation.map((item) => (
            <Link
              aria-current={pathname === item.href ? "page" : undefined}
              className={`site-nav__link${pathname === item.href ? " is-active" : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          {!identity && !isCheckingSession && (
            <Link className="site-nav__link site-nav__link--register" href="/register">
              Create account
            </Link>
          )}
        </nav>

        <div className="site-account">
          {isCheckingSession ? (
            <span aria-label="Checking sign-in status" className="site-account__loading" />
          ) : identity ? (
            <>
              <span className="site-account__identity">
                <span className="site-account__role">{identity.role}</span>
                <span className="site-account__email">{identity.email}</span>
              </span>
              <button className="site-account__signout" onClick={() => void handleSignOut()} type="button">
                Sign out
              </button>
            </>
          ) : (
            <Link className="site-account__signin" href="/login">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}