import type { Metadata } from "next";
import { Disclosure } from "@/components/Disclosure";
import { AppPage, PageTitle } from "@/components/layout/Page";
import { SHOWCASE } from "@/lib/showcase";

export const metadata: Metadata = { title: "Privacy" };

// Every answer here was checked against the code (2026-10-18). Change the code, change the answer.
export default function PrivacyPage() {
  return (
    <AppPage>
      <PageTitle title="Privacy" sub="What Reachable keeps, and what it doesn't. Open a question to read the answer." />
      <div className="max-w-[760px] space-y-3">
        {SHOWCASE && (
          <Disclosure question="What does this showcase send?" defaultOpen>
            <p>Nothing. It only loads its own files and the map pictures from OpenStreetMap. It never asks where you
              are, and the trips are recordings made with the live app.</p>
          </Disclosure>
        )}
        <Disclosure question="Do you track where I go?" defaultOpen={!SHOWCASE}>
          <p>No. When you ask for a route, we use your start and destination (and your location, if you choose
            &ldquo;Your location&rdquo;) to plan it. The trip isn&apos;t stored on our server or linked to you.</p>
        </Disclosure>
        <Disclosure question="What's kept on my phone?">
          <p>This browser keeps your needs (the route filter), places you&apos;ve picked recently, your recent trips,
            and whether you like night mode or a collapsed sidebar. It stays on this device; we don&apos;t copy it to our
            server.</p>
        </Disclosure>
        <Disclosure question="What do you keep about barrier reports?">
          <p>The kind of barrier, where it is, your note, and when it was reported. We
            don&apos;t keep who sent it. Reports are kept so they keep helping everyone after you; when a barrier is
            fixed, its report is marked as cleared.</p>
        </Disclosure>
        <Disclosure question="Can I add a photo?">
          <p>Not yet. Photo reports are switched off for now, so we don&apos;t collect any photos. When they come back,
            this page will say how they&apos;re handled.</p>
        </Disclosure>
        <Disclosure question="Which services see my data?">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-ink">OpenStreetMap</strong> serves the map pictures, so it sees which part of the map you look at.</li>
            <li><strong className="text-ink">Photon by Komoot</strong> searches addresses, so it sees what you type in search.</li>
            <li><strong className="text-ink">Transport for NSW</strong> plans public transport, so it sees a trip&apos;s start and destination.</li>
            <li><strong className="text-ink">Open-Meteo</strong> gives the weather near where a trip starts.</li>
            <li><strong className="text-ink">Turso</strong> hosts our database (barrier reports and lift updates).</li>
            <li><strong className="text-ink">Claude by Anthropic</strong> explains public transport trips and reads road notices for the map, when it&apos;s turned on.</li>
          </ul>
        </Disclosure>
        <Disclosure question="How do I delete my data?">
          <p>To remove what&apos;s on your phone, clear this site&apos;s data in your browser settings. To remove a barrier
            report, ask the Reachable team.</p>
        </Disclosure>
      </div>
    </AppPage>
  );
}
