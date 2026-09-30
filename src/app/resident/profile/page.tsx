import { ProfileForm } from "./profile-form";

export default function ResidentProfilePage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-12">
      <section className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Resident account
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Resident profile</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Enter your details as they should appear on barangay documents.
        </p>
        <div className="mt-6">
          <ProfileForm />
        </div>
      </section>
    </main>
  );
}