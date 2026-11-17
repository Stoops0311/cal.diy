import { APP_NAME, COMPANY_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import { getTranslate } from "app/_utils";

import { LegalPage } from "../LegalPage";
import { getMarketingShellCopy } from "../MarketingShell";

export const generateMetadata = async () => {
  const t = await getTranslate();
  return { title: `${t("privacy_policy")} | ${APP_NAME}` };
};

const contact = <a href={`mailto:${SUPPORT_MAIL_ADDRESS}`}>{SUPPORT_MAIL_ADDRESS}</a>;

const PrivacyPage = async () => {
  const t = await getTranslate();

  return (
    <LegalPage
      shellCopy={getMarketingShellCopy(t)}
      title={t("privacy_policy")}
      effectiveDate="Effective 17 November 2026"
      intro={
        <>
          This policy explains what information {COMPANY_NAME} (&ldquo;{APP_NAME}&rdquo;, &ldquo;we&rdquo;)
          collects when you use {APP_NAME}, how we use it, and the choices you have. {APP_NAME} is a
          scheduling service: it reads your availability, publishes booking pages, and records the meetings
          people book with you.
        </>
      }
      sections={[
        {
          heading: "Information we collect",
          body: (
            <ul>
              <li>
                <strong>Account information.</strong> Your name, email address, username, time zone, and
                profile details you add. Sign-in is handled by our authentication provider, Clerk; we do not
                store your password when you sign in through Clerk.
              </li>
              <li>
                <strong>Calendar information.</strong> If you connect a calendar, we access the events and
                free/busy information needed to show your availability, prevent double bookings, and add
                booked meetings to your calendar.
              </li>
              <li>
                <strong>Booking information.</strong> When someone books time with you, we store the details
                they provide (such as name, email address, notes, and answers to your booking questions) along
                with the meeting time and location.
              </li>
              <li>
                <strong>Billing information.</strong> Paid plans are sold through Polar, which acts as our
                payment provider. Card details are entered on Polar&rsquo;s checkout and are never stored by{" "}
                {APP_NAME}. We keep your plan, subscription status, and billing period.
              </li>
              <li>
                <strong>Technical information.</strong> Logs such as IP address, browser type, and request
                times, which we use to operate, secure, and debug the service.
              </li>
            </ul>
          ),
        },
        {
          heading: "How we use information",
          body: (
            <ul>
              <li>
                To provide scheduling: showing availability, creating bookings, and sending confirmations and
                reminders.
              </li>
              <li>To create, update, and cancel calendar events and video meetings you ask us to manage.</li>
              <li>To run your account, team, and subscription.</li>
              <li>To keep the service secure, prevent abuse, and fix problems.</li>
              <li>To contact you about your account or changes to the service.</li>
            </ul>
          ),
        },
        {
          heading: "Google user data",
          body: (
            <>
              <p>
                If you connect Google Calendar or Google Meet, {APP_NAME} requests access to view your
                calendars and to view and edit events on them. We use this access only to check your
                availability, add, update, and remove the events you book through {APP_NAME}, and attach
                Google Meet links when you choose Meet as a location.
              </p>
              <p>
                {APP_NAME}&rsquo;s use and transfer to any other app of information received from Google APIs
                will adhere to the{" "}
                <a href="https://developers.google.com/terms/api-services-user-data-policy">
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. We do not sell Google user data, use it for
                advertising, or use it to train generalized AI or machine-learning models, and people do not
                read it except where you ask us to for support, where needed for security, or where required
                by law.
              </p>
            </>
          ),
        },
        {
          heading: "How we share information",
          body: (
            <>
              <p>We do not sell personal information. We share it only:</p>
              <ul>
                <li>With the people involved in a booking, who see the details needed for that meeting.</li>
                <li>
                  With service providers that run {APP_NAME} on our behalf, including Vercel (hosting), Neon
                  (database), Clerk (sign-in), Polar (payments), our email delivery provider, and any calendar
                  or video service you choose to connect, each limited to what they need to provide their
                  service.
                </li>
                <li>
                  When required by law, or to protect the rights, safety, and security of users and the
                  service.
                </li>
                <li>As part of a merger, acquisition, or sale of assets, subject to this policy.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Retention and deletion",
          body: (
            <p>
              We keep your information while your account is active. You can disconnect a calendar at any time
              in your settings, which stops our access to it, and you can revoke access from your Google or
              Microsoft account settings. You can delete your account from your profile settings, after which
              we delete your account data, except where we must keep limited records for legal, billing, or
              security reasons.
            </p>
          ),
        },
        {
          heading: "Security",
          body: (
            <p>
              Data is encrypted in transit, and calendar credentials are encrypted at rest. No system is
              perfectly secure, but we limit access to personal information to what is needed to run the
              service.
            </p>
          ),
        },
        {
          heading: "Your choices and rights",
          body: (
            <p>
              You can access and update most of your information in your settings. Depending on where you
              live, you may have the right to request access to, correction of, or deletion of your personal
              information, or to object to certain processing. To make a request, contact us at {contact}.
            </p>
          ),
        },
        {
          heading: "Children",
          body: (
            <p>
              {APP_NAME} is not directed to children under 16, and we do not knowingly collect their
              information.
            </p>
          ),
        },
        {
          heading: "Changes to this policy",
          body: (
            <p>
              We may update this policy. If we make material changes, we will notify you by email or in the
              app before they take effect. The effective date above shows when it last changed.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: <p>Questions about this policy or your data: {contact}.</p>,
        },
      ]}
    />
  );
};

export default PrivacyPage;
