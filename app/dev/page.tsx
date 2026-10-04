import { redirect } from "next/navigation";

export default function DevHomePage() {
  redirect("/admin/login");
}
