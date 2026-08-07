import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";

export default async function TofoHomePage() {
  const user = await getCurrentAppUser();
  redirect(user ? "/tofo/projects" : "/tofo/auth");
}
