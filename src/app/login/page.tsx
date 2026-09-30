import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Barangay Services
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Resident sign in</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Sign in with the account registered for your barangay services.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}