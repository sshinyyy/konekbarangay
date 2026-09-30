"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  createResidentIdentity,
  resendResidentSignupConfirmation,
} from "@/lib/supabase/client";

function signUpErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "An account with this email already exists. Use Sign in instead.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Sign-up is temporarily rate-limited. Check your email or try signing in if you may already have an account; otherwise wait before retrying.";
  }
  if (normalized.includes("password") && (normalized.includes("weak") || normalized.includes("short") || normalized.includes("characters"))) {
    return message;
  }
  if (normalized.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  if (normalized.includes("fetch") || normalized.includes("network")) {
    return "Could not reach Supabase. Check your connection and project URL, then try again.";
  }

  return message
    ? `Supabase signup failed: ${message.slice(0, 180)}`
    : "Supabase signup failed. Check the project Auth settings and try again.";
}

function subscribeToLocationHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getLocationHash() {
  return window.location.hash;
}

function getServerLocationHash() {
  return "";
}

export function RegisterForm() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationHash = useSyncExternalStore(
    subscribeToLocationHash,
    getLocationHash,
    getServerLocationHash,
  );
  const expiredConfirmationLink =
    new URLSearchParams(locationHash.slice(1)).get("error_code") === "otp_expired";

  useEffect(() => {
    if (expiredConfirmationLink) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [expiredConfirmationLink]);

  async function provisionAccount(accessToken: string) {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName }),
      });

      if (response.ok) {
        setPendingAccessToken(null);
        setIsRegistered(true);
        return;
      }

      if (response.status === 409 || response.status === 401) {
        setPendingAccessToken(null);
        setMessage(
          "This identity cannot be registered as a resident. Contact the barangay administrator.",
        );
        return;
      }

      if (response.status === 403) {
        const result = (await response.json()) as { error?: string };
        if (result.error === "email_confirmation_required") {
          setPendingAccessToken(null);
          setAwaitingEmailConfirmation(true);
          return;
        }
      }

      setMessage(
        "Your sign-in identity was created, but account setup could not finish. Retry to complete setup.",
      );
    } catch {
      setMessage(
        "Your sign-in identity was created, but account setup could not finish. Retry to complete setup.",
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      if (pendingAccessToken) {
        await provisionAccount(pendingAccessToken);
        return;
      }

      const { data, error } = await createResidentIdentity(email, password, displayName);
      if (error) throw error;

      if (!data.session) {
        if (data.user?.identities?.length === 0) {
          setAwaitingEmailConfirmation(true);
          setMessage("A signup for this email already exists. Request a fresh confirmation link or sign in if it was already confirmed.");
          return;
        }
        setAwaitingEmailConfirmation(true);
        setMessage("Check your email to confirm your account. The link will return here to finish setup.");
        return;
      }

      setPendingAccessToken(data.session.access_token);
      await provisionAccount(data.session.access_token);
    } catch (error) {
      setMessage(signUpErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsResending(true);
    setResendError(false);
    setMessage("");

    try {
      const { error } = await resendResidentSignupConfirmation(email.trim());
      if (error) throw error;
      setMessage("A new confirmation link was sent. Check your inbox and spam folder.");
    } catch (error) {
      setResendError(true);
      setMessage(signUpErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }

  if (isRegistered) {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Resident account created. You can now sign in.
        </p>
        <Link
          className="block w-full rounded-md bg-emerald-800 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-900"
          href="/resident/profile"
        >
          Continue to resident profile
        </Link>
      </div>
    );
  }

  if (awaitingEmailConfirmation || expiredConfirmationLink) {
    return (
      <div className="space-y-4">
        <p aria-live="polite" className={`rounded-md border p-4 text-sm ${resendError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {message || (expiredConfirmationLink
            ? "That confirmation link expired or was already used. Request a fresh link below."
            : "Confirm your email, then sign in to finish resident account setup.")}
        </p>
        <form className="space-y-3" onSubmit={handleResend}>
          <label className="block space-y-1 text-sm font-medium text-zinc-800">
            Email for confirmation
            <input
              autoComplete="email"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <button
            className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isResending}
            type="submit"
          >
            {isResending ? "Sending..." : "Resend confirmation email"}
          </button>
        </form>
        <Link
          className="block w-full rounded-md bg-emerald-800 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-900"
          href="/login"
        >
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-1 text-sm font-medium text-zinc-800">
        Full name
        <input
          autoComplete="name"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          disabled={pendingAccessToken !== null}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-zinc-800">
        Email
        <input
          autoComplete="email"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          disabled={pendingAccessToken !== null}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-zinc-800">
        Password
        <input
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          disabled={pendingAccessToken !== null}
          minLength={8}
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
        {isSubmitting
          ? "Creating account..."
          : pendingAccessToken
            ? "Retry account setup"
            : "Create resident account"}
      </button>
      <p className="text-center text-sm text-zinc-600">
        Already registered? <Link className="font-medium text-emerald-800 underline" href="/login">Sign in</Link>
      </p>
    </form>
  );
}