"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Triage has been replaced by Telegram notifications + the Knowledge Base index.
 * Redirecting to the Knowledge Base.
 */
export default function TriageRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-muted">
        Triage has moved to the <a href="/" className="text-accent hover:underline">Knowledge Base</a>.
      </p>
    </div>
  );
}
