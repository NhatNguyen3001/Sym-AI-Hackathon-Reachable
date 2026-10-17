import type { Metadata } from "next";
import { AppPage, PageTitle } from "@/components/layout/Page";
import { LiveClient } from "./LiveClient";

export const metadata: Metadata = { title: "Live updates" };

export default function LivePage() {
  return (
    <AppPage>
      <PageTitle title="Live updates" sub="Everything our agents and users have found near Macquarie University, newest first." />
      <LiveClient />
    </AppPage>
  );
}
