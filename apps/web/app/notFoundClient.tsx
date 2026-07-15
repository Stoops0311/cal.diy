"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Icon } from "@calcom/ui/components/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

export function NotFound({ host: _host }: { host: string }) {
  const { t } = useLocale();
  const pathname = usePathname() ?? "";
  const isBookingSuccessPage = pathname?.startsWith("/booking");

  useLayoutEffect(() => {
    if (typeof window !== "undefined") {
      window.CalComPageStatus = "404";
    }
  }, []);

  const links = [
    {
      title: t("not_found_home"),
      description: t("not_found_home_description"),
      icon: "arrow-left" as const,
      href: "/",
    },
    {
      title: t("not_found_products"),
      description: t("not_found_products_description"),
      icon: "calendar" as const,
      href: "/products",
    },
    {
      title: t("not_found_manifesto"),
      description: t("not_found_manifesto_description"),
      icon: "file-text" as const,
      href: "/manifesto",
    },
  ];

  return (
    <div className="flex min-h-screen items-center bg-default px-4 py-12" data-testid="404-page">
      <main className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-subtle md:min-h-[560px] md:grid-cols-[0.82fr_1.18fr]">
        <section className="flex flex-col justify-between bg-inverted p-8 text-inverted md:p-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-inverted/55">
            {t("error_404")}
          </p>
          <div className="py-20 md:py-0">
            <p className="font-mono text-7xl leading-none text-inverted/20 md:text-8xl">404</p>
            <h1 className="mt-6 max-w-sm font-cal text-4xl leading-none text-inverted md:text-5xl">
              {isBookingSuccessPage ? t("booking_not_found") : t("page_doesnt_exist")}
            </h1>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-inverted/45">Convenio</span>
        </section>

        <section className="flex flex-col justify-center bg-subtle p-6 md:p-12">
          <p className="mb-10 max-w-md text-sm leading-relaxed text-subtle">
            {t("check_spelling_mistakes_or_go_back")}
          </p>
          <ul role="list" className="divide-y divide-muted border-muted border-y">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group relative flex items-start gap-4 rounded-xl px-3 py-5 transition-colors hover:bg-default">
                  <div className="shrink-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-default">
                      <Icon name={link.icon} className="h-4 w-4 text-default" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-cal text-base text-emphasis">{link.title}</h2>
                    <p className="mt-1 text-sm text-subtle">{link.description}</p>
                  </div>
                  <div className="shrink-0 self-center">
                    <Icon
                      name="arrow-right"
                      className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
