"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";
import type React from "react";
import { Suspense } from "react";

type HeaderPropsBase = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  eyebrow?: string;
  CTA?: React.ReactNode;
  ctaClassName?: string;
  borderInShellHeader?: boolean;
};

type HeaderPropsWithBackButton = HeaderPropsBase & {
  backButton: true;
  onBackButtonClick: () => void;
};

type HeaderPropsWithoutBackButton = HeaderPropsBase & {
  backButton?: false;
  onBackButtonClick?: never;
};

type HeaderProps = HeaderPropsWithBackButton | HeaderPropsWithoutBackButton;

const SuspenseFallback = () => (
  <SkeletonContainer>
    <div className="stack-y-6 py-8">
      <SkeletonText className="h-8 w-full" />
      <SkeletonText className="h-8 w-full" />
      <SkeletonText className="h-8 w-full" />
    </div>
  </SkeletonContainer>
);

export default function Header({
  children,
  title,
  description,
  eyebrow,
  CTA,
  ctaClassName,
  borderInShellHeader,
  backButton,
  onBackButtonClick,
}: HeaderProps) {
  const { t } = useLocale();

  return (
    <div>
      <header
        className={classNames(
          "border-subtle mx-auto flex justify-between border-b pb-6",
          !borderInShellHeader && "mb-8"
        )}>
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center">
            {backButton && onBackButtonClick && (
              <Button
                variant="icon"
                size="sm"
                color="minimal"
                onClick={onBackButtonClick}
                className="rounded-md ltr:mr-2 rtl:ml-2"
                StartIcon="arrow-left"
                aria-label={t("go_back")}
              />
            )}
            <div>
              {eyebrow && (
                <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">{eyebrow}</p>
              )}
              {title ? (
                <h1 className="font-cal text-emphasis text-xl font-bold tracking-tight sm:text-2xl">
                  {title}
                </h1>
              ) : (
                <div className="bg-emphasis mb-1 h-5 w-24 animate-pulse rounded-lg" />
              )}
              {description ? (
                <p className="text-subtle text-sm ltr:mr-4 rtl:ml-4">{description}</p>
              ) : (
                <div className="bg-emphasis h-5 w-32 animate-pulse rounded-lg" />
              )}
            </div>
          </div>
          <div className={classNames("shrink-0", ctaClassName)}>{CTA}</div>
        </div>
      </header>
      <Suspense fallback={<SuspenseFallback />}>{children}</Suspense>
    </div>
  );
}
