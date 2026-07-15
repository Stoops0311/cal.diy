import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("admin"),
    () => "",
    undefined,
    undefined,
    "/settings/admin"
  );

const Page = () => redirect("/settings/admin/users");
export default Page;
