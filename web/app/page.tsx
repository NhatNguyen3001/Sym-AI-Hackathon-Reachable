import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ExploreClient } from "@/components/map/ExploreClient";

export const metadata: Metadata = { title: "Around you" };

export default function Home() {
  return (
    <AppShell map>
      <ExploreClient />
    </AppShell>
  );
}
