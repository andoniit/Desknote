import { deskStickerByName } from "@/lib/emoji/desk-sticker";

/**
 * One-tap messages for the desk quick-send strip (keep under 140 chars).
 * Sticker characters match “Desk stickers” (MDI PUA) so the desk can render them.
 */
export type QuickSendPreset = {
  /** Stable key for React lists / analytics */
  id: string;
  /** Exact text stored and sent */
  text: string;
};

const heart = deskStickerByName("heart");
const sun = deskStickerByName("sun");

export const QUICK_SEND_PRESETS: readonly QuickSendPreset[] = [
  { id: "good-morning", text: `Good morning${heart ? ` ${heart}` : ""}` },
  { id: "miss-you", text: "Miss you" },
  { id: "eat-lunch", text: "Eat lunch" },
  { id: "drink-water", text: "Drink water" },
  { id: "call-free", text: "Call me when free" },
  { id: "good-luck", text: `Good luck today${sun ? ` ${sun}` : ""}` },
] as const;

export type QuickSendTargetId = "my_desk" | "her_desk" | "both";
