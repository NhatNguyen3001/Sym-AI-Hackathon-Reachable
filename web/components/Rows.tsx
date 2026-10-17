import { ArrowUpFromLine, Check, CircleAlert, MoveVertical, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { StatusBadge, badgeTone } from "./StatusBadge";
import { explainUpdate } from "@/lib/plainUpdate";
import type { AgentCardData, Step, UpdateItem, VenueCheck } from "@/lib/types";

const STEP_ICONS = { check: Check, slope: TrendingUp, alert: CircleAlert, lift: MoveVertical, crossing: ArrowUpFromLine };

export function RouteStep({ step }: { step: Step }) {
  const Icon = STEP_ICONS[step.icon] ?? Check;
  const warn = step.icon === "alert" || badgeTone(step.confidence) === "warn";
  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", warn ? "text-warn" : "text-primary")} strokeWidth={2.4} />
      <span className="flex-1 text-[16px]">{step.label}</span>
    </li>
  );
}

export function VenueCheckRow({ check }: { check: VenueCheck["checks"][number] }) {
  const warn = badgeTone(check.status) === "warn";
  const Icon = warn ? CircleAlert : Check;
  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", warn ? "text-warn" : "text-primary")} strokeWidth={2.4} />
      <div className="flex-1">
        <p className="text-[16px]">{check.field}</p>
        <p className="text-[14px] text-muted">{check.source}</p>
      </div>
      <StatusBadge label={check.status} />
    </li>
  );
}

export function UpdateRow({ item }: { item: UpdateItem }) {
  const plain = explainUpdate(item);
  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[13px] font-bold tracking-wide text-muted uppercase">{plain.kind}</p>
        <StatusBadge label={plain.statusLabel} />
      </div>
      <p className="mt-1 text-[18px] font-bold">{item.title}</p>
      <p className="mt-1 text-[16px]">{plain.effect}</p>
      <dl className="mt-3 space-y-1 text-[15px]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-bold">Where</dt>
          <dd>{item.place}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-bold">Last checked</dt>
          <dd>{item.time}</dd>
        </div>
        <div>
          <dt className="font-bold">Information from</dt>
          <dd>{plain.sources.join(". ")}</dd>
        </div>
      </dl>
      {plain.demo && (
        <p className="mt-2 text-[14px] text-muted">Demonstration data, not a live government feed.</p>
      )}
    </li>
  );
}

export function AgentCard({ agent }: { agent: AgentCardData }) {
  return (
    <li className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">{agent.name}</p>
        <p className={cn("text-[15px] font-bold", agent.tone === "primary" && "text-primary",
          agent.tone === "warn" && "text-warn-strong", agent.tone === "muted" && "text-muted")}>
          {agent.status}
        </p>
      </div>
      <p className="mt-1 text-[15px] text-muted">{agent.desc}</p>
    </li>
  );
}
