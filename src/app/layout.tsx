import type { Metadata } from "next";
import { Inter, Nunito, Patrick_Hand } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import Chatbot from "@/components/Chatbot";
import WaterTouchEffects from "@/components/effects/WaterTouchEffects";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-nunito",
});

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-patrick-hand",
});

export const metadata: Metadata = {
  title: "Sphinx - AI-Powered Career & Finance Platform",
  description: "Comprehensive platform combining job search, AI resume builder, stock dashboard, news feed, expense tracking, and intelligent chatbot",
  keywords: ["job search", "resume builder", "stock market", "AI", "career", "finance"],
  authors: [{ name: "Sphinx Team" }],
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${nunito.variable} font-sans antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          {children}
          <Chatbot />
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
