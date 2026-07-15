import type React from "react";

import "./marketing.css";
import { marketingFontVariables } from "./marketingFonts";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cv-root ${marketingFontVariables}`}>{children}</div>;
}
