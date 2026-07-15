import { IdentityProvider } from "@calcom/prisma/enums";
import { Button } from "@calcom/ui/components/button";
import AuthContainer from "@components/ui/AuthContainer";
import { XIcon } from "@coss/ui/icons";
import type { PageProps } from "app/_types";
import { _generateMetadata, getTranslate } from "app/_utils";
import { z } from "zod";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => t("error"),
    () => "",
    undefined,
    undefined,
    "/auth/error"
  );
};

const querySchema = z.object({
  error: z.string().optional(),
  provider: z.string().optional(),
});

const ServerPage = async ({ searchParams }: PageProps) => {
  const t = await getTranslate();

  const { error, provider } = querySchema.parse({
    error: (await searchParams)?.error || undefined,
    provider: (await searchParams)?.provider || undefined,
  });

  // generate error message based on different errors
  const getErrorMessage = (error: string | undefined, provider: string | undefined) => {
    if (error === "user-creation-error") {
      return t("user_creation_error");
    } else if (error === "wrong-provider") {
      // showing user their original identity provider by which account is managed.
      const providerName =
        provider === IdentityProvider.GOOGLE
          ? "Google"
          : provider === IdentityProvider.CAL
            ? t("identity_provider_email_password")
            : provider === IdentityProvider.SAML
              ? t("identity_provider_saml")
              : t("identity_provider_original_login_method");
      return t("account_managed_by_identity_provider_error", { provider: providerName });
    } else if (error === "saml-idp-not-authoritative") {
      return t("saml_idp_not_authoritative_error");
    } else if (error === "unverified-email") {
      return t("unverified_email_oauth_error");
    }
    return t("error_during_login");
  };

  const errorMsg = getErrorMessage(error, provider);

  return (
    <AuthContainer>
      <div>
        <div className="bg-error mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <XIcon className="text-error h-6 w-6" />
        </div>
        <div className="mt-3 text-center sm:mt-5">
          <h1 className="font-cal text-emphasis text-balance text-2xl leading-tight">{errorMsg}</h1>
          {error && (
            <p className="text-subtle mt-3 font-mono text-[11px] uppercase tracking-[0.18em]">
              {t("error_code")}: {error}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 sm:mt-6">
        <Button href="/auth/login" className="flex w-full justify-center">
          {t("go_back_login")}
        </Button>
      </div>
    </AuthContainer>
  );
};

export default ServerPage;
