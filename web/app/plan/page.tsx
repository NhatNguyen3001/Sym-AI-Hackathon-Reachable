import type { Metadata } from "next";
import { AppPage } from "@/components/layout/Page";
import { PlanClient } from "./PlanClient";

export const metadata: Metadata = { title: "Plan a trip" };

export default function PlanPage() {
  return (
    <AppPage>
      <PlanClient />
    </AppPage>
  );
}
