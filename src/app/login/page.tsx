import { LoginForm } from "./login-form";
import { AuthFrame } from "../components/auth-frame";

export default function LoginPage() {
  return (
    <AuthFrame
      description="Sign in with the email registered for barangay services."
      eyebrow="Resident account"
      title="Welcome back"
    >
      <LoginForm />
    </AuthFrame>
  );
}