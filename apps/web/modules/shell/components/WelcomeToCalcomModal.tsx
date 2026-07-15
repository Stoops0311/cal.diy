"use client";

import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent } from "@calcom/ui/components/dialog";
import { motion } from "framer-motion";

type WelcomeToCalcomModalProps = {
  isOpen: boolean;
  closeModal: () => void;
};

export function WelcomeToCalcomModal({ isOpen, closeModal }: WelcomeToCalcomModalProps) {
  const { t } = useLocale();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent
        type={null}
        title={t("welcome_to_calcom", { appName: APP_NAME })}
        size="default"
        className="p-0!">
        <div className="flex max-h-[80vh] flex-col gap-6 overflow-y-auto p-10 pb-8">
          <p className="font-mono text-subtle text-center text-[11px] uppercase tracking-[0.22em]">
            {t("auth_panel_eyebrow")}
          </p>

          {/* The mark draws itself: two arcs arriving at the same point */}
          <svg viewBox="0 0 32 32" fill="none" className="text-emphasis mx-auto h-28 w-28" aria-hidden="true">
            <motion.path
              d="M4 5 Q 22 7, 26 16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }}
            />
            <motion.path
              d="M4 27 Q 22 25, 26 16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, delay: 0.15, ease: [0.6, 0, 0.2, 1] }}
            />
            <motion.circle
              cx="26"
              cy="16"
              r="2"
              fill="currentColor"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.4 }}
            />
          </svg>

          <div className="flex flex-col gap-3 text-center">
            <h2 className="font-cal text-emphasis text-3xl leading-none">
              {t("welcome_to_calcom", { appName: APP_NAME })}
            </h2>
            <p className="text-subtle mx-auto max-w-[26em] text-sm leading-relaxed">
              {t("welcome_modal_statement")}
            </p>
          </div>
        </div>

        <div className="bg-muted border-subtle flex shrink-0 items-center justify-end rounded-b-2xl border-t px-8 py-6">
          <Button color="primary" onClick={closeModal}>
            {t("continue")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
