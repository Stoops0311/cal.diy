"use client";

import classNames from "@calcom/ui/classNames";
import { SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";

export function TroubleshooterSkeleton() {
  return (
    <SkeletonContainer>
      <div className="flex min-h-screen w-full">
        {/* Sidebar */}
        <div className="border-subtle hidden w-[250px] shrink-0 flex-col gap-4 border-r p-6 md:flex lg:w-[430px]">
          <SkeletonText className="h-4 w-24" />
          <SkeletonText className="h-10 w-full rounded-md" />
          <SkeletonText className="h-4 w-32" />
          <SkeletonText className="h-24 w-full rounded-md" />
          <SkeletonText className="h-24 w-full rounded-md" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header bar */}
          <div className="border-subtle flex h-[70px] items-center justify-between border-b px-6">
            <SkeletonText className="h-6 w-48" />
            <SkeletonText className="h-9 w-40 rounded-md" />
          </div>
          {/* Calendar grid */}
          <div className="grid flex-1 grid-cols-3 gap-2 p-6 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonText
                key={i}
                className={classNames("min-h-96 h-full w-full rounded-md", i > 2 && "hidden md:block")}
              />
            ))}
          </div>
        </div>
      </div>
    </SkeletonContainer>
  );
}
