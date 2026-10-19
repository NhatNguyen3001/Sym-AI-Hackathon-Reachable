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
            This site plays back trips recorded with the live app, so it can&apos;t take reports. Reachable&apos;s{" "}
            <a href={GITHUB_URL} className="font-bold text-primary underline">code on GitHub</a> shows how reports work
            and how to run the full app yourself.
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
