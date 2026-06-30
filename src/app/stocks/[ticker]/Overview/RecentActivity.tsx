"use client";

import { timeAgo } from "@/lib/db";

interface TimelineItem {
  type: "file" | "entry" | "relationship";
  date: string;
  data: any;
}

interface RecentActivityProps {
  timeline: TimelineItem[];
}

export function RecentActivity({ timeline }: RecentActivityProps) {
  const items = timeline.slice(0, 5);

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-4">
        📌 Recent Activity
      </h2>

      {items.length === 0 ? (
        <p className="text-muted text-xs">No recent activity.</p>
      ) : (
        <div className="relative pl-5 border-l border-border space-y-4">
          {items.map((item, i) => {
            const color =
              item.type === "file"
                ? "border-blue-400 bg-blue-400/20"
                : item.type === "relationship"
                  ? "border-purple-400 bg-purple-400/20"
                  : "border-accent bg-accent/20";

            const label =
              item.type === "file" ? "File" : item.type === "relationship" ? "Relation" : "Note";

            const labelColor =
              item.type === "file"
                ? "text-blue-400"
                : item.type === "relationship"
                  ? "text-purple-400"
                  : "text-accent";

            const mainText =
              item.type === "file"
                ? item.data.originalName
                : item.type === "relationship"
                  ? item.data.target
                  : item.data.title || item.data.content.slice(0, 80);

            return (
              <div key={i} className="relative">
                <div className={`absolute -left-[23px] w-2.5 h-2.5 rounded-full border ${color}`} />
                <div className="flex items-center gap-2">
                  <span className={`text-xs uppercase ${labelColor}`}>{label}</span>
                  <span className="text-muted text-xs">{timeAgo(item.date)}</span>
                </div>
                <p className="text-fg/70 text-sm truncate mt-0.5">{mainText}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
