import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/hooks/store";
import { ToastProvider } from "@/hooks/toast";

export const metadata: Metadata = {
  title: "CMT Stitching & Packing System",
  description: "Department management system for CMT operations",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <ToastProvider>
          <Providers>{children}</Providers>
        </ToastProvider>
      </body>
    </html>
  );
}
