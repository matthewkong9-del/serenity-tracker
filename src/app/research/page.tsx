"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Research Agent has been replaced by the orchestrator + Telegram commands.
 * Redirecting to the Knowledge Base.
 */
export default function ResearchRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-muted">
        Research is now handled by the autonomous pipeline. See the{" "}
        <a href="/" className="text-accent hover:underline">Knowledge Base</a>.
      </p>
    </div>
  );
}
