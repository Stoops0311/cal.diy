import { Archivo, IBM_Plex_Mono } from "next/font/google";

const displayFont = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-cv-display",
  display: "swap",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-cv-mono",
  display: "swap",
});

export const marketingFontVariables = `${displayFont.variable} ${monoFont.variable}`;
