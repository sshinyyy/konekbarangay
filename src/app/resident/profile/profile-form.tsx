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

  function getMissingRequiredFields() {
    const requiredFields: Array<keyof ProfileFields> = [
      "firstName",
      "lastName",
      "birthDate",
      "houseStreet",
      "barangay",
      "municipality",
      "province",
    ];

    return requiredFields.filter((field) => !String(profile[field] ?? "").trim());
  }

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
    setIsError(false);
    setMessage("");

    const missingRequiredFields = getMissingRequiredFields();
    if (missingRequiredFields.length > 0) {
      setIsError(true);
      setMessage("Complete the required profile fields before saving.");
      return;
    }

    setIsSaving(true);

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
      router.replace("/resident/requests");
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
    <form className="profile-form" onSubmit={handleSubmit}>
      <section className="profile-section">
        <div className="profile-section__heading">
          <h2>Personal details</h2>
          <p>Enter your name as it should appear on barangay documents.</p>
        </div>
        <div className="profile-grid">
          {fields.slice(0, 4).map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                autoComplete={field.name === "firstName" ? "given-name" : field.name === "lastName" ? "family-name" : "off"}
                onChange={(event) => updateField(field.name, event.target.value)}
                required={field.required}
                value={profile[field.name]}
              />
            </label>
          ))}
          <label>
            Date of birth
            <input
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => updateField("birthDate", event.target.value)}
              required
              type="date"
              value={profile.birthDate}
            />
          </label>
          <label>
            Civil status
            <select onChange={(event) => updateField("civilStatus", event.target.value)} value={profile.civilStatus}>
              <option value="">Select status</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>
            Contact number
            <input autoComplete="tel" onChange={(event) => updateField("contactNumber", event.target.value)} value={profile.contactNumber} />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-section__heading">
          <h2>Home address</h2>
          <p>Use your current residential address.</p>
        </div>
        <div className="profile-grid">
          {fields.slice(5).map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                autoComplete="off"
                onChange={(event) => updateField(field.name, event.target.value)}
                required={field.required}
                value={profile[field.name]}
              />
            </label>
          ))}
        </div>
      </section>
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
          {isSaving ? "Saving..." : "Complete profile"}
        </button>
        <Link className="text-sm font-medium text-emerald-800 underline" href="/resident/requests">
          Go to document requests
        </Link>
      </div>
    </form>
  );
}