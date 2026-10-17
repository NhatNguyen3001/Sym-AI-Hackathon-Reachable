import type { Metadata } from "next";
import { AppPage, PageTitle } from "@/components/layout/Page";
import { LiveClient } from "./LiveClient";

export const metadata: Metadata = { title: "Live updates" };

export default function LivePage() {
  return (
    <AppPage>
      <PageTitle
        title="Live updates"
        sub="What has changed on paths, lifts and buildings around Macquarie University, newest first. Each item says what happened, where, whether people can still get through, and where the information came from."
      />
      <LiveClient />
    </AppPage>
  );
}
