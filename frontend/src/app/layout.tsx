import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/hooks/store";

export const metadata: Metadata = {
  title: "CMT Stitching & Packing System",
  description: "Department management system for CMT operations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
