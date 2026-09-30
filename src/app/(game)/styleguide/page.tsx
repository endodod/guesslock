import { notFound } from "next/navigation";
import { Styleguide } from "@/components/Styleguide";

export const metadata = { title: "Styleguide", robots: { index: false } };

// Dev-only: every component in every state.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_STYLEGUIDE !== "1") notFound();
  return <Styleguide />;
}
