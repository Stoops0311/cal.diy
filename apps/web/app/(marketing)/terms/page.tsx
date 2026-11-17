import { APP_NAME, COMPANY_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import { getTranslate } from "app/_utils";
import Link from "next/link";

import { LegalPage } from "../LegalPage";
import { getMarketingShellCopy } from "../MarketingShell";

export const generateMetadata = async () => {
  const t = await getTranslate();
  return { title: `${t("terms_of_service")} | ${APP_NAME}` };
};

const contact = <a href={`mailto:${SUPPORT_MAIL_ADDRESS}`}>{SUPPORT_MAIL_ADDRESS}</a>;

const TermsPage = async () => {
  const t = await getTranslate();

  return (
    <LegalPage
      shellCopy={getMarketingShellCopy(t)}
      title={t("terms_of_service")}
      effectiveDate="Effective 17 November 2026"
      intro={
        <>
          These terms govern your use of {APP_NAME}, provided by {COMPANY_NAME} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;). By creating an account or using {APP_NAME}, you agree to them. If you use{" "}
          {APP_NAME} on behalf of an organization, you agree on its behalf.
        </>
      }
      sections={[
        {
          heading: "Early access",
          body: (
            <p>
              {APP_NAME} is currently offered as an early-access service to a limited group of users. Features
              may change, be interrupted, or be removed, and data may need to be migrated as the service
              develops. Keep your own records of anything critical.
            </p>
          ),
        },
        {
          heading: "Your account",
          body: (
            <p>
              You must provide accurate information and keep your sign-in credentials secure. You are
              responsible for activity under your account and must tell us promptly at {contact} if you
              suspect unauthorized access.
            </p>
          ),
        },
        {
          heading: "Acceptable use",
          body: (
            <>
              <p>You agree not to:</p>
              <ul>
                <li>
                  Use {APP_NAME} to send spam, harass others, or collect people&rsquo;s data without their
                  consent.
                </li>
                <li>Break the law or infringe anyone&rsquo;s rights.</li>
                <li>
                  Interfere with, probe, or overload the service, or bypass its security or usage limits.
                </li>
                <li>Resell or provide the service to others except as your plan allows.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Your content and the people who book with you",
          body: (
            <p>
              You keep ownership of the content you add, such as event details and booking questions, and you
              give us permission to use it only to operate the service for you. You are responsible for having
              a lawful basis to collect information from people who book with you and for what you ask them to
              provide.
            </p>
          ),
        },
        {
          heading: "Connected services",
          body: (
            <p>
              {APP_NAME} works with third-party services such as Google Calendar, Google Meet, and payment and
              video providers. Your use of those services is governed by their own terms, and we are not
              responsible for their availability or actions. How we handle data from them is described in our{" "}
              <Link href="/privacy">{t("privacy_policy")}</Link>.
            </p>
          ),
        },
        {
          heading: "Plans and payment",
          body: (
            <p>
              Some features require a paid plan. Subscriptions are sold and billed through our payment
              provider, Polar, whose checkout and terms apply to the purchase. Plans renew automatically for
              the period shown at checkout until cancelled; you can cancel at any time, and access continues
              until the end of the paid period. Fees are non-refundable except where required by law. We will
              give notice before changing prices for an existing subscription.
            </p>
          ),
        },
        {
          heading: "Suspension and termination",
          body: (
            <p>
              You can stop using {APP_NAME} and delete your account at any time. We may suspend or end access
              if you breach these terms, if required by law, or if we discontinue the service, and we will
              give reasonable notice where we can.
            </p>
          ),
        },
        {
          heading: "Disclaimers",
          body: (
            <p>
              {APP_NAME} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent
              permitted by law, we disclaim all warranties, express or implied, including merchantability,
              fitness for a particular purpose, and non-infringement, and we do not guarantee that the service
              will be uninterrupted, error-free, or that every booking or notification will be delivered.
            </p>
          ),
        },
        {
          heading: "Limitation of liability",
          body: (
            <p>
              To the extent permitted by law, we are not liable for indirect, incidental, special,
              consequential, or punitive damages, or for lost profits, revenue, or data. Our total liability
              for any claim relating to {APP_NAME} is limited to the amount you paid us for the service in the
              twelve months before the claim, or USD 100 if greater.
            </p>
          ),
        },
        {
          heading: "Changes to these terms",
          body: (
            <p>
              We may update these terms. If changes are material, we will notify you by email or in the app
              before they take effect. Continuing to use {APP_NAME} after that means you accept the updated
              terms.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: <p>Questions about these terms: {contact}.</p>,
        },
      ]}
    />
  );
};

export default TermsPage;
