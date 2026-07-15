import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkOnboardingRedirect } from "@calcom/features/auth/lib/onboardingUtils";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConvenioMark, getMarketingShellCopy, MarketingFooter, MarketingHeader } from "./MarketingShell";

export const generateMetadata = async () => {
  const t = await getTranslate();
  return { title: t("marketing_home_meta_title"), description: t("marketing_home_meta_description") };
};

const ROWS = [
  {
    label: "marketing_home_event_types_label",
    heading: "marketing_home_event_types_heading",
    body: "marketing_home_event_types_body",
  },
  {
    label: "marketing_home_availability_label",
    heading: "marketing_home_availability_heading",
    body: "marketing_home_availability_body",
  },
  {
    label: "marketing_home_teams_label",
    heading: "marketing_home_teams_heading",
    body: "marketing_home_teams_body",
  },
  {
    label: "marketing_home_workflows_label",
    heading: "marketing_home_workflows_heading",
    body: "marketing_home_workflows_body",
  },
];

const HomePage = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (session?.user?.id) {
    const organizationId = session.user.profile?.organizationId ?? null;
    const onboardingPath = await checkOnboardingRedirect(session.user.id, {
      checkEmailVerification: true,
      organizationId,
    });
    if (onboardingPath) {
      redirect(onboardingPath);
    }
    redirect("/event-types");
  }

  const t = await getTranslate();
  const shellCopy = getMarketingShellCopy(t);

  return (
    <>
      <MarketingHeader copy={shellCopy} />
      <main>
        <section className="cv-container cv-hero">
          <div>
            <span className="cv-eyebrow">{t("marketing_tagline")}</span>
            <h1 className="cv-display">
              {t("marketing_home_hero_line_one")}
              <br />
              {t("marketing_home_hero_line_two")}
            </h1>
            <p className="cv-body">{t("marketing_home_meta_description")}</p>
            <div className="cv-hero-actions">
              <Link href="/signup" className="cv-pill">
                {t("get_started")}
              </Link>
              <Link href="/manifesto" className="cv-pill cv-pill--ghost">
                {t("marketing_read_manifesto")}
              </Link>
            </div>
          </div>
          <ConvenioMark size="100%" animate className="cv-mark-hero" />
        </section>

        <section className="cv-container cv-rows" aria-label={t("marketing_what_convenio_does")}>
          {ROWS.map((row, i) => (
            <div className="cv-row" key={row.label}>
              <span className="cv-row-num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <span className="cv-eyebrow">{t(row.label)}</span>
                <h3>{t(row.heading)}</h3>
              </div>
              <div className="cv-row-body cv-body">
                <p>{t(row.body)}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="cv-band">
          <div className="cv-container">
            <span className="cv-eyebrow">{t("marketing_from_manifesto")}</span>
            <p>{t("marketing_manifesto_excerpt")}</p>
          </div>
        </section>

        <section className="cv-container cv-cta">
          <span className="cv-eyebrow">Convenio</span>
          <h2>{t("marketing_arrive_on_purpose")}</h2>
          <div className="cv-hero-actions">
            <Link href="/signup" className="cv-pill">
              {t("get_started")}
            </Link>
            <Link href="/products" className="cv-pill cv-pill--ghost">
              {t("marketing_see_product")}
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter copy={shellCopy} />
    </>
  );
};

export default HomePage;
