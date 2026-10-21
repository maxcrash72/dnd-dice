import { DiceStyle } from "../types/DiceStyle";
import { DiceType } from "../types/DiceType";

/**
 * Roll API for other extensions served from the same origin
 * (https://maxcrash72.github.io), e.g. the dnd-sheet character sheet.
 *
 * Messages are exchanged over a `window.BroadcastChannel` with this name.
 * A client sends `ping` to detect the extension and `roll` to throw dice;
 * the dice are rolled with physics in the player's own popover tray, synced
 * to the rest of the party like a normal roll, and the result is sent back.
 */
export const API_CHANNEL = "io.github.maxcrash72.dnd-dice/api";
export const API_VERSION = 1;

export const MAX_REQUESTED_DICE = 20;

/** Dice to roll: die types or nested groups (e.g. `["D100", "D10"]` for a percentile roll) */
export interface RequestedDice {
  dice: (DiceType | RequestedDice)[];
  combination?: "HIGHEST" | "LOWEST" | "SUM";
  bonus?: number;
}

export type ApiMessage =
  | { type: "ping"; id: string }
  | { type: "pong"; id: string; version: number }
  | {
      type: "roll";
      id: string;
      roll: RequestedDice;
      hidden?: boolean;
      style?: DiceStyle;
    }
  | {
      type: "result";
      id: string;
      /** Final value of the roll including the bonus */
      total: number;
      /** Value of every top level entry of `roll.dice`, in request order */
      values: number[];
    }
  | { type: "error"; id: string; message: string };
