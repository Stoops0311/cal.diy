import { APP_NAME, COMPANY_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import { normalizeAppBrandText } from "./normalizeAppBrandText";

describe("normalizeAppBrandText", () => {
  it("removes legacy Cal branding from app metadata", () => {
    expect(normalizeAppBrandText("Connect [Cal.diy](https://cal.com) with help@cal.com.")).toBe(
      `Connect ${APP_NAME} with ${SUPPORT_MAIL_ADDRESS}.`
    );
    expect(normalizeAppBrandText("Cal.com, Inc.")).toBe(COMPANY_NAME);
    expect(normalizeAppBrandText("Cal Video is the in-house conferencing platform.")).toBe(
      `${APP_NAME} Video is the in-house conferencing platform.`
    );
  });
});
