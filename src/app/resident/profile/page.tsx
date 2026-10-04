import { ProfileForm } from "./profile-form";
import Link from "next/link";

export default function ResidentProfilePage() {
  return (
    <main className="workspace-page">
      <div className="workspace-page__inner">
        <header className="page-heading">
          <div>
            <p className="page-kicker">Resident portal</p>
            <h1 className="page-title">My profile</h1>
            <p className="page-description">Keep your details current for barangay document requests.</p>
          </div>
          <Link className="page-heading__link" href="/resident/requests">Go to requests</Link>
        </header>
        <section aria-label="Resident profile details" className="workspace-panel page-content">
          <ProfileForm />
        </section>
      </div>
    </main>
  );
}