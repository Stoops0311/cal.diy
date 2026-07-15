"use client";

import { SkeletonText } from "@calcom/ui/components/skeleton";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type OnboardingCardProps = {
  title: string;
  subtitle: string;
  children?: ReactNode;
  footer?: ReactNode;
  isLoading?: boolean;
  floatingFooter?: boolean;
};

export const OnboardingCard = ({
  title,
  subtitle,
  children,
  footer,
  isLoading,
  floatingFooter = false,
}: OnboardingCardProps) => {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

  // Animation variants for entry and exit
  const containerVariants = {
    initial: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
    },
    animate: {
      opacity: 1,
      y: 0,
    },
    exit: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : -20,
    },
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          className="flex h-full min-h-0 w-full flex-col"
          variants={containerVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{
            duration: 0.2,
            ease: "easeOut",
          }}>
          {/* Card Header */}
          <div className="mb-2 flex w-full gap-1.5 py-2  md:mb-0 md:py-4">
            <div className="flex w-full flex-col gap-2">
              <h1 className="font-cal text-xl font-semibold leading-6">{title}</h1>
              <p className="text-subtle text-sm leading-tight">{subtitle}</p>
            </div>
          </div>

          {/* Content */}
          <div
            className={`flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto [container-type:size] ${
              floatingFooter ? "pb-16" : ""
            }`}>
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SkeletonText className="h-40 w-full" />
                <SkeletonText className="h-40 w-full" />
              </div>
            ) : (
              children
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Footer */}
      {floatingFooter ? (
        <div className="border-subtle bg-default sticky bottom-0 left-0 right-0 z-10 flex items-center justify-start border-t p-2">
          {footer}
        </div>
      ) : (
        <div className="mt-4 flex w-full items-center justify-start py-2">{footer}</div>
      )}
    </div>
  );
};
