import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { AuthOptions, Session } from "next-auth";
import { getLegacyNextAuthSession } from "./legacyNextAuthSession";

async function getServerSession(options: {
  req: NextApiRequest | GetServerSidePropsContext["req"];
  authOptions?: AuthOptions;
}): Promise<Session | null> {
  return getLegacyNextAuthSession(options);
}

export { getServerSession };
