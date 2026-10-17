import type { Metadata } from "next";
import { AppPage, Card, PageTitle } from "@/components/layout/Page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <AppPage>
      <PageTitle title="Privacy" sub="What Reachable keeps, and what it doesn't." />
      <Card className="max-w-[760px] space-y-4 text-[17px]">
        <p><strong>Your needs stay on your device.</strong> The route filter is saved in this browser only. We use it to plan a route when you ask, and we don&apos;t store it on our server.</p>
        <p><strong>Barrier reports don&apos;t say who you are.</strong> We save the barrier, its location and your photo, not who reported it or where you&apos;ve travelled. Photos have their location data removed when they&apos;re uploaded.</p>
        <p><strong>Recent places</strong> are kept in this browser so you can choose them again. Clearing your browser data removes them.</p>
      </Card>
    </AppPage>
  );
}
