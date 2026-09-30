import { RequestCenter } from "./request-center";

export default function ResidentRequestsPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-12">
      <section className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Resident account
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Document requests</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Submit a request and track its receipt and current status.
        </p>
        <div className="mt-6">
          <RequestCenter />
        </div>
      </section>
    </main>
  );
}