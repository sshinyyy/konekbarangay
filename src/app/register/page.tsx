import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Barangay Services
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          Create a resident account
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Use your email to register for barangay services.
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </section>
    </main>
  );
}