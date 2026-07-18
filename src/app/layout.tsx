import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Auth0Provider } from "@auth0/nextjs-auth0";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Downwind — satellites keep the receipts",
  description:
    "Climate-policy debates run on rhetoric; satellites have been keeping receipts for 40 years. Downwind retrieves observed precedent for any policy.",
};

// Resolve the theme before first paint so there's no flash of the wrong
// scenery. Runs synchronously in <head>; falls back to the OS preference until
// the reader picks one explicitly.
const THEME_INIT = `(function(){try{var s=localStorage.getItem("dw-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=(s==="light"||s==="dark")?s:(d?"dark":"light");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Auth0Provider>{children}</Auth0Provider>
      </body>
    </html>
  );
}
