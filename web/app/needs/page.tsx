import { redirect } from "next/navigation";

/** Route filters now live on the map. Keep the old address working. */
export default function NeedsPage() {
  redirect("/");
}
