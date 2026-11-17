// Comparing against `Bearer ${process.env.CRON_SECRET}` directly accepts the literal "Bearer undefined"
// when the secret is unset, so an unset secret must mean "no credential matches".
function matchesConfiguredSecret(credential: string | null, expected: string | undefined): boolean {
  return Boolean(expected) && credential === expected;
}

export function isCronSecretBearer(credential: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return matchesConfiguredSecret(credential, secret ? `Bearer ${secret}` : undefined);
}

export function isCronCredential(credential: string | null): boolean {
  return isCronSecretBearer(credential) || matchesConfiguredSecret(credential, process.env.CRON_API_KEY);
}
