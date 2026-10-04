import type { ReactNode } from "react";

const steps = [
  "Create your resident account",
  "Complete your profile",
  "Submit and track document requests",
];

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-page__inner">
        <aside className="auth-story">
          <p className="auth-story__eyebrow">A clearer path to local services</p>
          <h2>Barangay services, connected from start to finish.</h2>
          <p className="auth-story__description">
            Keep your information, requests, and document updates together in one secure account.
          </p>
          <ol className="auth-steps">
            {steps.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">0{index + 1}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </aside>
        <section aria-labelledby="auth-title" className="auth-card">
          <p className="page-kicker">{eyebrow}</p>
          <h1 className="auth-card__title" id="auth-title">{title}</h1>
          <p className="auth-card__description">{description}</p>
          <div className="auth-card__content">{children}</div>
        </section>
      </div>
    </main>
  );
}