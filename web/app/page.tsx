import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ExploreClient } from "@/components/map/ExploreClient";

// The root page is in the layout's own segment, so the "%s · Reachable" template does not apply here.
export const metadata: Metadata = { title: { absolute: "Around you · Reachable" } };

export default function Home() {
  return (
    <AppShell map>
      <ExploreClient />
    </AppShell>
  );
}
