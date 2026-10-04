"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  emptyProfile,
  hasProfileChanged,
  isProfileComplete,
  profileFieldsFromRecord,
  type ProfileFields,
  type ResidentProfileRecord,
} from "./profile-form-state";

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
  const [savedProfile, setSavedProfile] = useState<ProfileFields | null>(null);
  const [isEditing, setIsEditing] = useState(true);
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

        const result = (await response.json()) as { profile: ResidentProfileRecord };

        if (isCurrent) {
          const loadedProfile = profileFieldsFromRecord(result.profile);
          setProfile(loadedProfile);
          setSavedProfile(result.profile ? loadedProfile : null);
          setIsEditing(!isProfileComplete(loadedProfile));
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

    if (!isProfileComplete(profile)) {
      setIsError(true);
      setMessage("Complete the required profile fields before saving.");
      return;
    }

    if (savedProfile && !hasProfileChanged(profile, savedProfile)) {
      setIsEditing(false);
      setMessage("No changes to save.");
      return;
    }

    setIsSaving(true);

    try {
      const wasAlreadyComplete = savedProfile !== null && isProfileComplete(savedProfile);
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

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        issues?: Array<{ message?: string }>;
        profile?: ResidentProfileRecord;
      } | null;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.replace("/login");
          return;
        }
        if (result?.error === "invalid_profile") {
          throw new Error(result.issues?.[0]?.message ?? "Check the profile details and try again.");
        }
        throw new Error("Your profile could not be saved. Your details are still here; please try again.");
      }

      const nextProfile = profileFieldsFromRecord(result?.profile ?? profile);
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      setIsEditing(false);
      if (!wasAlreadyComplete) {
        router.replace("/resident/requests");
      } else {
        setMessage("Profile changes saved.");
      }
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateField(name: keyof ProfileFields, value: string) {
    setProfile((current) => ({ ...current, [name]: value }));
  }

  function cancelEditing() {
    if (!savedProfile) return;
    setProfile(savedProfile);
    setIsEditing(false);
    setIsError(false);
    setMessage("");
  }

  if (isLoading) {
    return <p className="loading-state" role="status">Loading profile...</p>;
  }

  if (savedProfile && !isEditing) {
    const fullName = [savedProfile.firstName, savedProfile.middleName, savedProfile.lastName, savedProfile.suffix]
      .filter(Boolean)
      .join(" ");
    const address = [
      savedProfile.houseStreet,
      savedProfile.purokSitio,
      savedProfile.barangay,
      savedProfile.municipality,
      savedProfile.province,
      savedProfile.postalCode,
    ].filter(Boolean).join(", ");

    return (
      <div className="profile-readonly">
        <div className="profile-readonly__header">
          <div>
            <span className="profile-complete-badge">Profile complete</span>
            <p>Your profile is saved. Edit it only when your details change.</p>
          </div>
          <button className="button-secondary" onClick={() => { setIsEditing(true); setMessage(""); }} type="button">
            Edit profile
          </button>
        </div>
        <dl className="profile-summary-grid">
          <div><dt>Full name</dt><dd>{fullName}</dd></div>
          <div><dt>Date of birth</dt><dd>{savedProfile.birthDate}</dd></div>
          <div><dt>Civil status</dt><dd>{savedProfile.civilStatus || "Not provided"}</dd></div>
          <div><dt>Contact number</dt><dd>{savedProfile.contactNumber || "Not provided"}</dd></div>
          <div className="profile-summary-grid__wide"><dt>Home address</dt><dd>{address}</dd></div>
        </dl>
        {message && <p aria-live="polite" className="profile-form__message">{message}</p>}
        <Link className="button-primary profile-readonly__requests" href="/resident/requests">Go to document requests</Link>
      </div>
    );
  }

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      {savedProfile && (
        <div className="profile-editor__heading">
          <div><h2>Edit profile</h2><p>Saving changes may require staff to verify your profile again.</p></div>
        </div>
      )}
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
          className="button-primary"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : savedProfile ? "Save profile changes" : "Complete profile"}
        </button>
        {savedProfile && (
          <button className="button-secondary" disabled={isSaving} onClick={cancelEditing} type="button">
            Cancel
          </button>
        )}
        <Link className="text-sm font-medium text-emerald-800 underline" href="/resident/requests">
          Go to document requests
        </Link>
      </div>
    </form>
  );
}