import type { GetServerSidePropsContext, NextApiRequest } from "next";
import type { AuthOptions, Session } from "next-auth";
import { getCurrentSession } from "./currentSession";

async function getServerSession(options: {
  req: NextApiRequest | GetServerSidePropsContext["req"];
  authOptions?: AuthOptions;
}): Promise<Session | null> {
  return getCurrentSession(options);
}

export { getServerSession };
