"use client";

import { TroubleshooterSkeleton } from "@calcom/web/modules/troubleshooter/components/TroubleshooterSkeleton";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const TroubleshooterClientOnly = dynamic(
  () =>
    import("@calcom/web/modules/troubleshooter/components/Troubleshooter").then((mod) => mod.Troubleshooter),
  {
    ssr: false,
    loading: () => <TroubleshooterSkeleton />,
  }
);

function TroubleshooterPage() {
  return (
    <Suspense fallback={<TroubleshooterSkeleton />}>
      <TroubleshooterClientOnly month={null} />
    </Suspense>
  );
}

export default TroubleshooterPage;
