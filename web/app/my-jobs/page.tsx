import { redirect } from "next/navigation";

export default function MyJobsRedirectPage() {
  redirect("/tasks");
}
