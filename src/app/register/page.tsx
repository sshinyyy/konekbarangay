import { RegisterForm } from "./register-form";
import { AuthFrame } from "../components/auth-frame";

export default function RegisterPage() {
  return (
    <AuthFrame
      description="Use your email to register for secure resident services."
      eyebrow="New resident account"
      title="Get started"
    >
      <RegisterForm />
    </AuthFrame>
  );
}