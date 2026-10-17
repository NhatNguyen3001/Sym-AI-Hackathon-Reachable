import { redirect } from "next/navigation";

/** The map is now where a trip starts. Keep the old address working. */
export default function PlanPage() {
  redirect("/");
}
