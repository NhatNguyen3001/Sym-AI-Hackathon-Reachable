import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { RouteClient } from "./RouteClient";

export const metadata: Metadata = { title: "Route and destination" };

export default function RoutePage() {
  return (
    <AppShell map>
      <Suspense fallback={<p className="p-7 text-muted" role="status">Finding your route…</p>}>
        <RouteClient />
      </Suspense>
    </AppShell>
  );
}
