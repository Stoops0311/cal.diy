"use client";

import { CALCOM_VERSION, COMPANY_NAME, IS_SELF_HOSTED } from "@calcom/lib/constants";
import { useEffect, useState } from "react";

// eslint-disable-next-line turbo/no-undeclared-env-vars
const vercelCommitHash = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
const commitHash = vercelCommitHash ? `-${vercelCommitHash.slice(0, 7)}` : "";
const appVersion = `v.${CALCOM_VERSION}-${!IS_SELF_HOSTED ? "h" : "sh"}`;

export default function Credits() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <small className="text-subtle mx-3 mb-3 mt-1 hidden font-mono text-[9px] uppercase tracking-[0.18em] lg:block">
      &copy; {new Date().getFullYear()} {COMPANY_NAME}
      {hasMounted && (
        <span className="opacity-70">
          {" "}
          {appVersion}
          {commitHash}
        </span>
      )}
    </small>
  );
}
