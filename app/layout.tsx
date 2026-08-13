import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Launchpad — US-Headquartered Software & AI Jobs",
  description: "A focused index of US-eligible software and applied AI jobs at verified US-headquartered companies.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
