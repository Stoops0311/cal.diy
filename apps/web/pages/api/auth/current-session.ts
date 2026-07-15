import { getCurrentSession } from "@calcom/features/auth/lib/currentSession";
import type { NextApiRequest, NextApiResponse } from "next";

async function currentSessionHandler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await getCurrentSession({ req });
  if (!session) {
    res.status(401).json(null);
    return;
  }

  res.status(200).json(session);
}

export default currentSessionHandler;
