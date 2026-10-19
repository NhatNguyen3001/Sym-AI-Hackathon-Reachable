import type { Metadata } from "next";
import { AppPage, PageTitle } from "@/components/layout/Page";
import { ReportClient } from "./ReportClient";
import { GITHUB_URL, SHOWCASE } from "@/lib/showcase";

export const metadata: Metadata = { title: "Report a barrier" };

export default function ReportPage() {
  return (
    <AppPage>
      {SHOWCASE ? (
        <>
          <PageTitle title="Report a barrier" sub="Barrier reports work in the live app." />
          <p className="max-w-[680px] text-[18px]">
            This is a showcase of recorded trips, so it can&apos;t take reports.{" "}
            <a href={GITHUB_URL} className="font-bold text-primary underline">Run Reachable live from GitHub</a> to try them.
          </p>
        </>
      ) : (
        <>
          <PageTitle title="Report a barrier" sub="Something blocking the way? One photo helps everyone who comes after you." />
          <ReportClient />
        </>
      )}
    </AppPage>
  );
}
