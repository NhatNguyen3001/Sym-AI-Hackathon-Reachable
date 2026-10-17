import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/AppHeader";
import { RouteClient } from "./RouteClient";

export const metadata: Metadata = { title: "Route and destination" };

export default function RoutePage() {
  return (
    <>
      <AppHeader />
      <main id="main" className="flex flex-1 flex-col">
        <Suspense fallback={<p className="p-7 text-muted" role="status">Finding your route…</p>}>
          <RouteClient />
        </Suspense>
      </main>
    </>
  );
}
