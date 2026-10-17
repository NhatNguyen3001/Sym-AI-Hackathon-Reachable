import { redirect } from "next/navigation";

/** How it works now lives on the map. Keep the old address working. */
export default function AboutPage() {
  redirect("/");
}
