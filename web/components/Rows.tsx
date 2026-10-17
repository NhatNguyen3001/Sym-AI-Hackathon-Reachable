import { ArrowUpFromLine, Check, CircleAlert, MoveVertical, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { StatusBadge, badgeTone } from "./StatusBadge";
import type { AgentCardData, Step, UpdateItem, VenueCheck } from "@/lib/types";

const STEP_ICONS = { check: Check, slope: TrendingUp, alert: CircleAlert, lift: MoveVertical, crossing: ArrowUpFromLine };

export function RouteStep({ step }: { step: Step }) {
  const Icon = STEP_ICONS[step.icon] ?? Check;
  const warn = step.icon === "alert" || badgeTone(step.confidence) === "warn";
  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", warn ? "text-warn" : "text-primary")} strokeWidth={2.4} />
      <span className="flex-1 text-[16px]">{step.label}</span>
      <span className={cn("text-[14px] font-bold", warn ? "text-warn-strong" : "text-muted")}>{step.confidence}</span>
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
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
      <span aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0 rounded-[3px]", item.tone === "warn" ? "bg-warn" : "bg-primary")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-bold">{item.title}</p>
          <StatusBadge label={item.status} />
        </div>
        <p className="text-[15px] text-muted">{item.place} · {item.time}</p>
        <p className="text-[14px] text-muted">Source: {item.source}</p>
      </div>
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
