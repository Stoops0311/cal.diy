import { getTranslate } from "app/_utils";
import Link from "next/link";
import { getMarketingShellCopy, MarketingFooter, MarketingHeader } from "../MarketingShell";

export const generateMetadata = async () => {
  const t = await getTranslate();
  return { title: t("marketing_products_meta_title"), description: t("marketing_products_meta_description") };
};

const SECTIONS = [
  {
    label: "marketing_products_booking_label",
    heading: "marketing_products_booking_heading",
    body: "marketing_products_booking_body",
    spec: [
      "marketing_products_booking_spec_one",
      "marketing_products_booking_spec_two",
      "marketing_products_booking_spec_three",
    ],
  },
  {
    label: "marketing_products_availability_label",
    heading: "marketing_products_availability_heading",
    body: "marketing_products_availability_body",
    spec: [
      "marketing_products_availability_spec_one",
      "marketing_products_availability_spec_two",
      "marketing_products_availability_spec_three",
    ],
  },
  {
    label: "marketing_products_team_label",
    heading: "marketing_products_team_heading",
    body: "marketing_products_team_body",
    spec: [
      "marketing_products_team_spec_one",
      "marketing_products_team_spec_two",
      "marketing_products_team_spec_three",
    ],
  },
  {
    label: "marketing_products_workflows_label",
    heading: "marketing_products_workflows_heading",
    body: "marketing_products_workflows_body",
    spec: [
      "marketing_products_workflows_spec_one",
      "marketing_products_workflows_spec_two",
      "marketing_products_workflows_spec_three",
    ],
  },
  {
    label: "marketing_products_apps_label",
    heading: "marketing_products_apps_heading",
    body: "marketing_products_apps_body",
    spec: [
      "marketing_products_apps_spec_one",
      "marketing_products_apps_spec_two",
      "marketing_products_apps_spec_three",
    ],
  },
  {
    label: "marketing_products_embed_label",
    heading: "marketing_products_embed_heading",
    body: "marketing_products_embed_body",
    spec: [
      "marketing_products_embed_spec_one",
      "marketing_products_embed_spec_two",
      "marketing_products_embed_spec_three",
    ],
  },
];

const ProductsPage = async () => {
  const t = await getTranslate();
  const shellCopy = getMarketingShellCopy(t);

  return (
    <>
      <MarketingHeader copy={shellCopy} current="products" />
      <main>
        <section className="cv-container cv-page-hero">
          <span className="cv-eyebrow">{t("marketing_the_product")}</span>
          <h1 className="cv-display">{t("marketing_products_hero")}</h1>
          <p className="cv-body">{t("marketing_products_intro")}</p>
        </section>

        <section className="cv-container cv-rows" aria-label={t("marketing_product_capabilities")}>
          {SECTIONS.map((section, i) => (
            <div className="cv-row" key={section.label}>
              <span className="cv-row-num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <span className="cv-eyebrow">{t(section.label)}</span>
                <h3>{t(section.heading)}</h3>
              </div>
              <div className="cv-row-body cv-body">
                <p>{t(section.body)}</p>
                <ul className="cv-spec">
                  {section.spec.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </section>

        <section className="cv-container cv-cta">
          <span className="cv-eyebrow">Convenio</span>
          <h2>{t("marketing_put_it_in_writing")}</h2>
          <div className="cv-hero-actions">
            <Link href="/signup" className="cv-pill">
              {t("get_started")}
            </Link>
            <Link href="/manifesto" className="cv-pill cv-pill--ghost">
              {t("marketing_read_manifesto")}
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter copy={shellCopy} />
    </>
  );
};

export default ProductsPage;
