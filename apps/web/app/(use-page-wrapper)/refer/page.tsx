import { IS_DUB_REFERRALS_ENABLED } from "@calcom/lib/constants";
import { _generateMetadata, getTranslate } from "app/_utils";
import Shell from "~/shell/Shell";
import { DubReferralsPage } from "./DubReferralsPage";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("referral_program"),
    (t) => t("referral_text"),
    undefined,
    undefined,
    "/refer"
  );

export default async function ReferralsPage() {
  const t = await getTranslate();

  if (!IS_DUB_REFERRALS_ENABLED) {
    return (
      <Shell
        eyebrow={t("referrals")}
        heading={t("referral_program")}
        subtitle={t("referrals_not_available_description")}>
        {null}
      </Shell>
    );
  }

  return (
    <Shell withoutMain={true}>
      <div className="-m-4 sm:-mt-6 md:-mt-4">
        <DubReferralsPage />
      </div>
    </Shell>
  );
}
