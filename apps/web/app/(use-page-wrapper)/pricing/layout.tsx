import type React from "react";

import "../../(marketing)/marketing.css";
import { marketingFontVariables } from "../../(marketing)/marketingFonts";

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cv-pricing-fonts ${marketingFontVariables}`}>{children}</div>;
}
