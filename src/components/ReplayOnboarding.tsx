"use client";
import { Button } from "./ui";

export function ReplayOnboarding() {
  return (
    <Button variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent("guesslock:onboarding"))}>
      Show the introduction again
    </Button>
  );
}
