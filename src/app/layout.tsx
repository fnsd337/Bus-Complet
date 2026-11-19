import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "أتوبيس كومبليت — الحرف عليك والمرح علينا",
  description: "لعبة أتوبيس كومبليت العربية، العبها أونلاين مع أصحابك من أي مكان."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
