import { StaffRequestQueue } from "./queue";

export default function StaffRequestsPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-12">
      <section className="mx-auto max-w-6xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Barangay staff
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Request review</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Review resident submissions and record a decision.
        </p>
        <div className="mt-6">
          <StaffRequestQueue />
        </div>
      </section>
    </main>
  );
}