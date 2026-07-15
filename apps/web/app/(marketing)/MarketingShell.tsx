import { COMPANY_NAME } from "@calcom/lib/constants";
import Link from "next/link";

type MarketingTranslate = (key: string) => string;

export function getMarketingShellCopy(t: MarketingTranslate) {
  return {
    mainNavigation: t("main_navigation"),
    footerNavigation: t("footer_navigation"),
    product: t("marketing_product"),
    manifesto: t("marketing_manifesto"),
    signIn: t("sign_in"),
    getStarted: t("get_started"),
    etymology: t("marketing_etymology_short"),
    tagline: t("marketing_tagline"),
  };
}

type MarketingShellCopy = ReturnType<typeof getMarketingShellCopy>;

/**
 * The Convenio mark: two arcs converging to a single point — the brief's
 * literalization of convenire ("to come together") without a handshake icon.
 * `animate` enables the hero draw-in; CSS handles reduced motion.
 */
export function ConvenioMark({
  size = 22,
  animate = false,
  className,
}: {
  size?: number | string;
  animate?: boolean;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 5 Q 22 7, 26 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        className={animate ? "cv-arc" : undefined}
      />
      <path
        d="M4 27 Q 22 25, 26 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        className={animate ? "cv-arc cv-arc--lower" : undefined}
      />
      <circle cx="26" cy="16" r="2.6" fill="currentColor" className={animate ? "cv-meet" : undefined} />
    </svg>
  );
}

export function MarketingHeader({
  copy,
  current,
}: {
  copy: MarketingShellCopy;
  current?: "products" | "manifesto" | "pricing";
}) {
  return (
    <header className="cv-header">
      <div className="cv-container cv-header-inner">
        <Link href="/" className="cv-wordmark">
          <ConvenioMark />
          Convenio
        </Link>
        <nav className="cv-nav" aria-label={copy.mainNavigation}>
          <Link
            href="/products"
            className="cv-nav-link"
            aria-current={current === "products" ? "page" : undefined}>
            {copy.product}
          </Link>
          <Link
            href="/manifesto"
            className="cv-nav-link"
            aria-current={current === "manifesto" ? "page" : undefined}>
            {copy.manifesto}
          </Link>
          <Link href="/auth/login" className="cv-nav-link cv-nav-link--secondary">
            {copy.signIn}
          </Link>
          <Link href="/signup" className="cv-pill">
            {copy.getStarted}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter({ copy }: { copy: MarketingShellCopy }) {
  return (
    <footer className="cv-footer">
      <div className="cv-container">
        <div className="cv-footer-inner">
          <div>
            <span className="cv-wordmark">
              <ConvenioMark />
              Convenio
            </span>
            <p className="cv-footer-etym">{copy.etymology}</p>
          </div>
          <nav className="cv-nav" aria-label={copy.footerNavigation}>
            <Link href="/products" className="cv-nav-link">
              {copy.product}
            </Link>
            <Link href="/manifesto" className="cv-nav-link">
              {copy.manifesto}
            </Link>
            <Link href="/auth/login" className="cv-nav-link">
              {copy.signIn}
            </Link>
          </nav>
        </div>
        <div className="cv-footer-legal">
          <span>
            &copy; {new Date().getFullYear()} {COMPANY_NAME}
          </span>
          <span>{copy.tagline}</span>
        </div>
      </div>
    </footer>
  );
}
