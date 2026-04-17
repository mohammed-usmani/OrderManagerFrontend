import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { VoiceAgentProvider } from "@/contexts/VoiceAgentContext";

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
    <html lang="en" className="dark h-full antialiased">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex flex-col oracle-glow selection:bg-primary selection:text-on-primary">
        <AuthProvider>
          <VoiceAgentProvider>{children}</VoiceAgentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
