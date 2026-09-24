import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { VoiceAgentProvider } from "@/contexts/VoiceAgentContext";
import { BackendStatusGate } from "@/components/BackendStatusGate";

// Self-hosted by next/font (no layout shift, no request to Google at runtime).
// globals.css maps these onto --font-headline / --font-body / --font-mono.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-fraunces",
});
const hankenGrotesk = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken-grotesk" });
const splineSansMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-spline-sans-mono" });

export const metadata: Metadata = {
  title: "Saffron & Smoke",
  description: "Saffron & Smoke — modern Indian in Bandra West, Mumbai.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark h-full antialiased bg-background ${fraunces.variable} ${hankenGrotesk.variable} ${splineSansMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The icon font isn't available through next/font. This is the root layout, so
            it does load on every page; the rule is written for the Pages Router. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex flex-col ember-glow selection:bg-primary selection:text-on-primary">
        <AuthProvider>
          <VoiceAgentProvider>
            <BackendStatusGate>{children}</BackendStatusGate>
          </VoiceAgentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
