import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock, DoorOpen, TriangleAlert } from "lucide-react";
import { StairsIcon } from "@/components/icons";
import { LivePreview } from "@/components/LivePreview";
import { Footer } from "@/components/layout/Footer";
import { LandingHeader } from "@/components/layout/LandingHeader";

export const metadata: Metadata = { title: { absolute: "Reachable · Step-free, from the stop to the door" } };

const primaryBtn = "inline-flex min-h-14 items-center justify-center rounded-[12px] bg-primary px-6 text-[17px] font-bold text-white hover:bg-primary-hover";
const secondaryBtn = "inline-flex min-h-14 items-center justify-center rounded-[12px] border border-line-strong bg-surface px-6 text-[17px] font-bold text-ink hover:bg-bg";

const PROBLEMS = [
  { Icon: StairsIcon, title: "Stairs and steep slopes", text: "A short walk on the map can be impossible in a wheelchair." },
  { Icon: DoorOpen, title: "Entrances you can't get into", text: "You often only find out about the step at the door when you arrive." },
  { Icon: Clock, title: "Information that's missing or out of date", text: "Surveys take months, and a broken lift or new roadworks makes them wrong overnight." },
];

const STEPS = [
  { title: "Tell us what you need", text: "In your own words, like 'manual wheelchair, nothing steep'." },
  { title: "We check the whole trip", text: "Sym AI agents check the path and the place you're going, using street photos, slope data, official updates and reviews." },
  { title: "Every trip makes it better", text: "Spot a barrier? One photo updates the map for everyone after you." },
];

const DIFFERENT = [
  { title: "Works anywhere from day one", text: "Agents research routes on demand, so we don't wait for someone to survey a street." },
  { title: "Checks the route and the destination", text: "Other apps do one or the other." },
  { title: "Honest about what it knows", text: "Every detail shows where it came from and how sure we are." },
];

export default function Landing() {
  return (
    <>
      <LandingHeader />
      <main id="main" className="flex-1">
        <section className="bg-bg">
          <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-14 sm:px-7 lg:grid-cols-[1.15fr_1fr] lg:py-20">
            <div>
              <p className="text-[15px] font-bold tracking-wide text-primary uppercase">Step-free, from the stop to the door</p>
              <h1 className="mt-3 text-[40px] leading-[1.1] font-bold sm:text-[52px]">Find a route you can actually use</h1>
              <p className="mt-5 max-w-[560px] text-[19px] text-muted">
                Transport apps get you to the stop. Reachable gets you from the stop to the door, and tells you before you leave
                whether the lift is working.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/plan" className={primaryBtn}>Plan a trip</Link>
                <a href="#how" className={secondaryBtn}>See how it works</a>
              </div>
            </div>
            <figure className="rounded-[18px] border border-line bg-surface p-6">
              <figcaption className="text-[18px] font-bold">Same trip, two answers</figcaption>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3 rounded-[14px] border border-line bg-bg p-4">
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-warn text-white">
                    <TriangleAlert className="size-5" strokeWidth={2.4} />
                  </span>
                  <div>
                    <p className="font-bold">Without lift status: south exit, 11 min</p>
                    <p className="text-[15px] text-muted">The south exit lift is out of service. You&apos;d find out when you get there.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[14px] border-2 border-primary bg-primary-soft p-4">
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-primary text-white">
                    <Check className="size-5" strokeWidth={2.6} />
                  </span>
                  <div>
                    <p className="font-bold text-primary-hover">Reachable: north exit, 10 min</p>
                    <p className="text-[15px] text-primary-hover">North exit lift is working, step-free path, gentle slopes, entrance checked</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[14px] text-muted">
                Macquarie University station to Waranara Library, manual wheelchair. Lift outage is demo data.
              </p>
            </figure>
          </div>
        </section>

        <section aria-labelledby="problem-h" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-7">
            <h2 id="problem-h" className="text-[30px] leading-tight font-bold">The fastest route isn&apos;t always one you can use</h2>
            <p className="mt-2 text-[18px] text-muted">Around 750,000 Australians use mobility aids.</p>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {PROBLEMS.map(({ Icon, title, text }) => (
                <li key={title} className="rounded-[18px] bg-bg p-5">
                  <Icon aria-hidden="true" className="size-6 text-warn" />
                  <p className="mt-3 text-[18px] font-bold">{title}</p>
                  <p className="mt-1 text-[16px] text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="scroll-mt-4 bg-bg">
          <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-7">
            <h2 id="how-h" className="text-[30px] font-bold">How it works</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-[18px] border border-line bg-surface p-5">
                  <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary text-[18px] font-bold text-white">{i + 1}</span>
                  <p className="mt-3 text-[18px] font-bold">{s.title}</p>
                  <p className="mt-1 text-[16px] text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="diff-h" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-7">
            <h2 id="diff-h" className="text-[30px] font-bold">Built to stay up to date</h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {DIFFERENT.map((d) => (
                <li key={d.title} className="rounded-[18px] bg-primary-soft p-5">
                  <p className="text-[18px] font-bold text-primary-hover">{d.title}</p>
                  <p className="mt-1 text-[16px] text-primary-hover">{d.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="now-h" className="bg-bg">
          <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="now-h" className="text-[30px] leading-tight font-bold">Happening now near Macquarie University</h2>
              <Link href="/live" className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">See all updates</Link>
            </div>
            <div className="mt-6"><LivePreview /></div>
          </div>
        </section>

        <section aria-labelledby="cta-h" className="bg-primary">
          <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-5 px-4 py-14 text-center sm:px-7">
            <h2 id="cta-h" className="text-[30px] font-bold text-white">Ready to plan your next trip?</h2>
            <Link href="/plan" className="inline-flex min-h-14 items-center rounded-[12px] bg-surface px-6 text-[17px] font-bold text-primary hover:bg-primary-soft focus-visible:outline-white">
              Plan a trip
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
