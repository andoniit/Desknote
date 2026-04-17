/**
 * One-tap messages for the desk quick-send strip (keep under 140 chars).
 */
export type QuickSendPreset = {
  /** Stable key for React lists / analytics */
  id: string;
  /** Exact text stored and sent */
  text: string;
};

export const QUICK_SEND_PRESETS: readonly QuickSendPreset[] = [
  { id: "good-morning", text: "Good morning ❤️" },
  { id: "miss-you", text: "Miss you" },
  { id: "eat-lunch", text: "Eat lunch" },
  { id: "drink-water", text: "Drink water" },
  { id: "call-free", text: "Call me when free" },
  { id: "good-luck", text: "Good luck today ✨" },
] as const;

export type QuickSendTargetId = "my_desk" | "her_desk" | "both";
