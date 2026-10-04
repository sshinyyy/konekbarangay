"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "@/lib/supabase/client";

type VerifiedIdentity = {
  email: string | null;
  role: "resident" | "staff" | "admin";
  uid: string;
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identity, setIdentity] = useState<VerifiedIdentity | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function redirectResidentAfterLogin(accessToken: string) {
    const response = await fetch("/api/resident/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      router.replace("/resident/profile");
      return;
    }

    const result = (await response.json()) as {
      profile: {
        firstName?: string | null;
        lastName?: string | null;
        birthDate?: string | null;
        houseStreet?: string | null;
        barangay?: string | null;
        municipality?: string | null;
        province?: string | null;
      } | null;
    };

    const profile = result.profile;
    const isProfileComplete = !!profile &&
      !!profile.firstName && !!profile.lastName && !!profile.birthDate &&
      !!profile.houseStreet && !!profile.barangay && !!profile.municipality && !!profile.province;

    router.replace(isProfileComplete ? "/resident/requests" : "/resident/profile");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const { data, error } = await signIn(email, password);
      if (error) throw error;
      const session = data.session;

      if (!session) {
        setMessage("Sign-in did not create a session. Confirm your email and try again.");
        return;
      }

      const headers = { Authorization: `Bearer ${session.access_token}` };
      let response = await fetch("/api/auth/me", { headers, cache: "no-store" });
      let requiresEmailConfirmation = false;

      if (response.status === 403) {
        const metadataName = data.user.user_metadata.display_name;
        const displayName = typeof metadataName === "string" && metadataName.trim()
          ? metadataName.trim()
          : email.split("@")[0];
        const registration = await fetch("/api/auth/register", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ displayName }),
        });
        if (registration.ok) {
          response = await fetch("/api/auth/me", { headers, cache: "no-store" });
        } else {
          const registrationResult = (await registration.json()) as { error?: string };
          requiresEmailConfirmation = registrationResult.error === "email_confirmation_required";
        }
      }

      if (!response.ok) {
        await signOut();
        setMessage(
          requiresEmailConfirmation
            ? "Confirm your email address, then sign in again to finish resident account setup."
            : response.status === 403
              ? "This account is not linked to an active barangay account. Contact the barangay administrator."
            : "We could not verify this account. Check the Supabase and database configuration.",
        );
        return;
      }

      const nextIdentity = (await response.json()) as VerifiedIdentity;
      setIdentity(nextIdentity);

      if (nextIdentity.role === "resident") {
        await redirectResidentAfterLogin(session.access_token);
      }
    } catch {
      setMessage("Sign-in failed. Check your email and password, then try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setIdentity(null);
    setPassword("");
    setMessage("You have signed out.");
  }

  if (identity) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Account access confirmed</p>
          <p className="mt-1">{identity.email ?? identity.uid}</p>
          <p className="mt-1 capitalize">Role: {identity.role}</p>
        </div>
        {(identity.role === "staff" || identity.role === "admin") && (
          <Link
            className="block w-full rounded-md bg-emerald-800 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-900"
            href="/staff/requests"
          >
            Open staff request queue
          </Link>
        )}
        {identity.role === "resident" && (
          <Link
            className="block w-full rounded-md bg-emerald-800 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-900"
            href="/resident/requests"
          >
            Open resident requests
          </Link>
        )}
        <button
          className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          onClick={handleSignOut}
          type="button"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-1 text-sm font-medium text-zinc-800">
        Email
        <input
          autoComplete="email"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-zinc-800">
        Password
        <input
          autoComplete="current-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {message && (
        <p aria-live="polite" className="text-sm text-red-700">
          {message}
        </p>
      )}
      <button
        className="w-full rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}