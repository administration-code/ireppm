// Lets people install ireppm.ca as an app on phones, tablets and computers ("Add to Home Screen").
export default function manifest() {
  return {
    name: "IRep Property Management",
    short_name: "IRep",
    description: "Rent, repairs, showings and your owner statements, all in one place.",
    id: "/",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F4EE",
    theme_color: "#161616",
    categories: ["business", "lifestyle"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My Home", url: "/account", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Owner Portal", url: "/owner", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Available Rentals", url: "/properties", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
      { name: "Staff", url: "/admin", icons: [{ src: "/brand/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
