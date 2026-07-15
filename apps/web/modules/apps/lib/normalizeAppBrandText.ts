import { APP_NAME, COMPANY_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";

export function normalizeAppBrandText(value: string): string {
  return value
    .replace(/\[(?:Cal\.diy|Cal\.com)\]\(https:\/\/(?:www\.)?cal\.com\/?\)/gi, APP_NAME)
    .replace(/Cal\.com, Inc\./g, COMPANY_NAME)
    .replace(/\bCal Video\b/gi, `${APP_NAME} Video`)
    .replace(/Cal\.diy/gi, APP_NAME)
    .replace(/(?:help|support)@cal\.com/gi, SUPPORT_MAIL_ADDRESS);
}
