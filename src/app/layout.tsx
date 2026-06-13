import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { VoiceAgentProvider } from "@/contexts/VoiceAgentContext";
import { BackendStatusGate } from "@/components/BackendStatusGate";

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
    <html lang="en" className="dark h-full antialiased bg-background">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Hanken+Grotesk:wght@400;500;600;700;800&family=Spline+Sans+Mono:wght@400;500;600&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
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
