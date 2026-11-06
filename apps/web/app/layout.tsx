import type { Metadata } from "next";

import { AppProviders } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "GG Analytics",
  description: "Local-first engineering contribution and Git analytics"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "(function(){try{var x=(localStorage.getItem(\"gg.theme\")||localStorage.getItem(\"gita.theme\"));var t=x===\"light\"||x===\"dark\"?x:(matchMedia(\"(prefers-color-scheme: dark)\").matches?\"dark\":\"light\");document.documentElement.dataset.theme=t;}catch(e){}})();" }} /></head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
