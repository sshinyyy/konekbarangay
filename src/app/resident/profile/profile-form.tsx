"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type ProfileFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthDate: string;
  civilStatus: string;
  contactNumber: string;
  houseStreet: string;
  purokSitio: string;
  barangay: string;
  municipality: string;
  province: string;
  postalCode: string;
};

const emptyProfile: ProfileFields = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  birthDate: "",
  civilStatus: "",
  contactNumber: "",
  houseStreet: "",
  purokSitio: "",
  barangay: "",
  municipality: "",
  province: "",
  postalCode: "",
};

const fields: { name: keyof ProfileFields; label: string; required?: boolean }[] = [
  { name: "firstName", label: "First name", required: true },
  { name: "middleName", label: "Middle name" },
  { name: "lastName", label: "Last name", required: true },
  { name: "suffix", label: "Suffix" },
  { name: "contactNumber", label: "Contact number" },
  { name: "houseStreet", label: "House number and street", required: true },
  { name: "purokSitio", label: "Purok / sitio" },
  { name: "barangay", label: "Barangay", required: true },
  { name: "municipality", label: "Municipality / city", required: true },
  { name: "province", label: "Province", required: true },
  { name: "postalCode", label: "Postal code" },
];

export function ProfileForm() {
  const router = useRouter();
  const [profile, setProfile] = useState(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void getSupabaseClient().auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      const session = data.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch("/api/resident/profile", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });

        if (response.status === 401 || response.status === 403) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          throw new Error("Profile load failed");
        }

        const result = (await response.json()) as {
          profile: Partial<Record<keyof ProfileFields, string | null>> | null;
        };

        if (isCurrent && result.profile) {
          setProfile({
            ...emptyProfile,
            ...Object.fromEntries(
              Object.entries(result.profile).map(([key, value]) => [key, value ?? ""]),
            ),
          });
        }
      } catch {
        if (isCurrent) {
          setIsError(true);
          setMessage("Could not load your profile. Confirm the profile database migration is applied.");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }).catch(() => {
      if (isCurrent) {
        setIsError(true);
        setMessage("Could not load your profile. Confirm the Supabase configuration and try again.");
        setIsLoading(false);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setIsError(false);
    setMessage("");

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/resident/profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Profile save failed");
      }

      setMessage("Profile saved.");
    } catch {
      setIsError(true);
      setMessage("Could not save your profile. Check the required fields and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateField(name: keyof ProfileFields, value: string) {
    setProfile((current) => ({ ...current, [name]: value }));
  }

  if (isLoading) {
    return <p className="text-sm text-zinc-600">Loading profile...</p>;
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.slice(0, 4).map((field) => (
          <label className="space-y-1 text-sm font-medium text-zinc-800" key={field.name}>
            {field.label}
            <input
              autoComplete={field.name === "firstName" ? "given-name" : field.name === "lastName" ? "family-name" : "off"}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              onChange={(event) => updateField(field.name, event.target.value)}
              required={field.required}
              value={profile[field.name]}
            />
          </label>
        ))}
        <label className="space-y-1 text-sm font-medium text-zinc-800">
          Date of birth
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => updateField("birthDate", event.target.value)}
            required
            type="date"
            value={profile.birthDate}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-zinc-800">
          Civil status
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
            onChange={(event) => updateField("civilStatus", event.target.value)}
            value={profile.civilStatus}
          >
            <option value="">Select status</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Widowed">Widowed</option>
            <option value="Separated">Separated</option>
            <option value="Other">Other</option>
          </select>
        </label>
        {fields.slice(4).map((field) => (
          <label className="space-y-1 text-sm font-medium text-zinc-800" key={field.name}>
            {field.label}
            <input
              autoComplete="off"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              onChange={(event) => updateField(field.name, event.target.value)}
              required={field.required}
              value={profile[field.name]}
            />
          </label>
        ))}
      </div>
      {message && (
        <p aria-live="polite" className={`text-sm ${isError ? "text-red-700" : "text-emerald-800"}`}>
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="rounded-md bg-emerald-800 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save profile"}
        </button>
        <Link className="text-sm font-medium text-emerald-800 underline" href="/resident/requests">
          Go to document requests
        </Link>
      </div>
    </form>
  );
}