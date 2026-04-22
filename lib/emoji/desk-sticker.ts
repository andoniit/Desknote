import { SUPPORTED_EMOJI } from "@/lib/emoji/supported.gen";

/**
 * Returns the PUA / MDI character for a sticker name from the desk-supported set
 * (same set as the composer “Desk stickers” row and firmware kEmoji).
 */
export function deskStickerByName(name: string): string {
  return SUPPORTED_EMOJI.find((e) => e.name === name)?.char ?? "";
}
