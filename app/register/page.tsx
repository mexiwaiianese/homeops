import RegisterForm from "@/components/register-form";
import { stripeReady } from "@/lib/stripe";

export default function RegisterPage() {
  return <RegisterForm processorOn={stripeReady()} />;
}
