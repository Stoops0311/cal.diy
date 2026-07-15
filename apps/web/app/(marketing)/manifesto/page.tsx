import { getTranslate } from "app/_utils";
import { ConvenioMark, getMarketingShellCopy, MarketingFooter, MarketingHeader } from "../MarketingShell";

export const generateMetadata = async () => {
  const t = await getTranslate();
  return { title: t("marketing_manifesto_meta_title"), description: t("marketing_manifesto_hero") };
};

const ManifestoPage = async () => {
  const t = await getTranslate();
  const shellCopy = getMarketingShellCopy(t);

  return (
    <>
      <MarketingHeader copy={shellCopy} current="manifesto" />
      <main>
        <section className="cv-container cv-page-hero">
          <span className="cv-eyebrow">{t("marketing_manifesto")}</span>
          <h1 className="cv-display">{t("marketing_manifesto_hero")}</h1>
        </section>

        <section className="cv-container cv-manifesto">
          <div className="cv-manifesto-body">
            <p>{t("marketing_manifesto_paragraph_one")}</p>
            <p>{t("marketing_manifesto_paragraph_two")}</p>
            <p>{t("marketing_manifesto_paragraph_three")}</p>
            <p>{t("marketing_manifesto_paragraph_four")}</p>
            <div className="cv-manifesto-close">
              <ConvenioMark size={28} />
              <span className="cv-eyebrow">{t("marketing_tagline")}</span>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter copy={shellCopy} />
    </>
  );
};

export default ManifestoPage;
