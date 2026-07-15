"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { IconName } from "@calcom/ui/components/icon";
import { motion } from "framer-motion";

/**
 * Convenio statement panel — the two arcs draw toward their meeting point,
 * then the plan's statement lands. Replaces the generic concentric-rings art.
 */
export function PlanIcon({
  variant = "single",
}: {
  icon?: IconName;
  variant?: "single" | "organization" | "team";
  animationDirection?: "up" | "down";
}) {
  const { t } = useLocale();
  const statement =
    variant === "single" ? t("onboarding_statement_personal") : t("onboarding_statement_team");

  return (
    <div className="text-inverted flex h-full w-full flex-col justify-between p-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] opacity-60">
        {t("auth_panel_eyebrow")}
      </p>

      <svg viewBox="0 0 32 32" fill="none" className="h-44 w-44 self-center" aria-hidden="true">
        <motion.path
          d="M4 5 Q 22 7, 26 16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }}
        />
        <motion.path
          d="M4 27 Q 22 25, 26 16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, delay: 0.15, ease: [0.6, 0, 0.2, 1] }}
        />
        <motion.circle
          cx="26"
          cy="16"
          r="1.8"
          fill="currentColor"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.4 }}
        />
      </svg>

      <motion.p
        key={variant}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="font-cal max-w-[11em] text-3xl leading-[1.08]">
        {statement}
      </motion.p>
    </div>
  );
}
