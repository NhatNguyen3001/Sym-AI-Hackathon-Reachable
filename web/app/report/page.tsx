import type { Metadata } from "next";
import { AppPage, PageTitle } from "@/components/layout/Page";
import { ReportClient } from "./ReportClient";

export const metadata: Metadata = { title: "Report a barrier" };

export default function ReportPage() {
  return (
    <AppPage>
      <PageTitle title="Report a barrier" sub="Something blocking the way? One photo helps everyone who comes after you." />
      <ReportClient />
    </AppPage>
  );
}
