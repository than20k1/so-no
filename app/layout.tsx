import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { vi } from "@/lib/i18n/vi";
import "./globals.css";

export const metadata: Metadata = {
  title: vi.appName,
  description: "Ghi nợ, trừ nợ nhanh cho người bán hàng",
  applicationName: vi.appName,
  appleWebApp: { capable: true, title: vi.appName, statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#151513" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
