import Link from "next/link";

const citizenFeatures = [
  "Resident profile management",
  "Document request tracking",
  "Secure supporting file upload",
  "Issued document download",
];

const staffFeatures = [
  "Request review queue",
  "Profile verification",
  "Approval and rejection workflow",
  "QR-verified document issuance",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-zinc-100 px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-emerald-100 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">KoneBarangay</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Barangay services, simplified.</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900"
              href="/login"
            >
              Resident sign in
            </Link>
            <Link
              className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
              href="/register"
            >
              Create account
            </Link>
          </div>
        </header>

        <section className="grid gap-8 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900">
              Digital barangay office
            </p>
            <h2 className="mt-5 max-w-xl text-4xl font-bold tracking-tight text-zinc-950 md:text-5xl">
              Request documents and manage resident records online.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-700">
              KoneBarangay helps residents submit document requests, maintain profile records, and receive secure issued documents while staff review requests and issue verified barangay documents through a streamlined digital workflow.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="rounded-md bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                href="/resident/requests"
              >
                Go to resident portal
              </Link>
              <Link
                className="rounded-md border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
                href="/staff/requests"
              >
                Staff dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm ring-1 ring-slate-200/60">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">Included services</p>
            <ul className="mt-5 space-y-4 text-sm text-zinc-700">
              {citizenFeatures.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Staff workflow</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {staffFeatures.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-700" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
