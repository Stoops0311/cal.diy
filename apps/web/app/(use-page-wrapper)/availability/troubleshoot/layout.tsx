"use client";

import { ErrorBoundary } from "@calcom/ui/components/errorBoundary";
import { TroubleshooterSkeleton } from "@calcom/web/modules/troubleshooter/components/TroubleshooterSkeleton";
import type React from "react";
import { Suspense } from "react";

export default function TroubleshooterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-1 *:flex-1">
        <ErrorBoundary>
          <Suspense fallback={<TroubleshooterSkeleton />}>{children}</Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
