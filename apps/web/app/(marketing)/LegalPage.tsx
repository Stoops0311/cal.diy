import type React from "react";

import { type getMarketingShellCopy, MarketingFooter, MarketingHeader } from "./MarketingShell";

export type LegalSection = { heading: string; body: React.ReactNode };

export function LegalPage({
  shellCopy,
  title,
  effectiveDate,
  intro,
  sections,
}: {
  shellCopy: ReturnType<typeof getMarketingShellCopy>;
  title: string;
  effectiveDate: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      <MarketingHeader copy={shellCopy} />
      <main>
        <section className="cv-container cv-page-hero">
          <span className="cv-eyebrow">{effectiveDate}</span>
          <h1 className="cv-display">{title}</h1>
        </section>
        <section className="cv-container cv-legal">
          <div className="cv-legal-body">
            <p>{intro}</p>
            {sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.body}
              </section>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter copy={shellCopy} />
    </>
  );
}
