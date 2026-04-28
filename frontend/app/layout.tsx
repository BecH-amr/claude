import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Q — skip the line",
  description: "Scan, join, wait anywhere. No app. No account.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Q",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F1EA",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom — disabling it (`maximumScale: 1`) is a WCAG 1.4.4 violation.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="min-h-dvh">
        <I18nProvider>
          <AuthProvider>
            <main className="mx-auto max-w-md min-h-dvh px-5 py-8 flex flex-col">
              {children}
            </main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
