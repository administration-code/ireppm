import { Cormorant_Garamond, Libre_Franklin } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabaseConfigured } from "@/lib/supabase";
import { SITE } from "@/lib/site";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const body = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "IRep Property Management | Windsor property management and rentals",
    template: "%s | IRep Property Management",
  },
  description:
    "Residential property management and leasing in Windsor and Essex County. Browse available rentals, book a showing and apply online.",
  openGraph: {
    siteName: SITE.name,
    locale: "en_CA",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#161616",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-CA" className={`${display.variable} ${body.variable}`}>
      <body>
        <AuthProvider>
          {!supabaseConfigured ? (
            <div className="notice">
              <div className="wrap">
                <b>Preview.</b> Sample listings are shown, and accounts are off, until the database is connected.
              </div>
            </div>
          ) : null}
          <Header />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
