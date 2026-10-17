import type { Metadata } from "next";
import { AppPage, PageTitle } from "@/components/layout/Page";
import { NeedsClient } from "./NeedsClient";

export const metadata: Metadata = { title: "My needs" };

export default function NeedsPage() {
  return (
    <AppPage>
      <PageTitle title="My needs" sub="Tell us in your own words. We'll turn it into route settings you can check and adjust." />
      <NeedsClient />
    </AppPage>
  );
}
