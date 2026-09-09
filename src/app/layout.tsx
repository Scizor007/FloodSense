import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FloodSense Hyderabad — Urban Waterlogging Early-Warning",
  description:
    "Predicting waterlogged streets before the water arrives. AI-powered flood risk forecasting, community reporting and civic response coordination for Hyderabad, India.",
  keywords: [
    "FloodSense",
    "Hyderabad",
    "flood prediction",
    "waterlogging",
    "urban resilience",
    "civic tech",
  ],
  icons: {
    icon: "/floodsense-icon.svg",
  },
  openGraph: {
    title: "FloodSense Hyderabad",
    description: "Predicting waterlogged streets before the water arrives.",
    siteName: "FloodSense",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#e1d6f4",
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
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
