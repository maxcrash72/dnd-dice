import { useDiceRollStore } from "../dice/store";
import { generateDiceId } from "../helpers/generateDiceId";
import { getCombinedDiceValue } from "../helpers/getCombinedDiceValue";
import { getDieFromDice } from "../helpers/getDieFromDice";
import { Dice, isDice } from "../types/Dice";
import { DiceRoll } from "../types/DiceRoll";
import { DiceStyle } from "../types/DiceStyle";
import { DiceType } from "../types/DiceType";
import { isDie } from "../types/Die";
import {
  API_CHANNEL,
  API_VERSION,
  ApiMessage,
  MAX_REQUESTED_DICE,
  RequestedDice,
} from "./protocol";

const DICE_TYPES: DiceType[] = ["D4", "D6", "D8", "D10", "D12", "D20", "D100"];
const DICE_STYLES: DiceStyle[] = [
  "GALAXY",
  "GEMSTONE",
  "GLASS",
  "IRON",
  "NEBULA",
  "SUNRISE",
  "SUNSET",
  "WALNUT",
];
const COMBINATIONS = ["HIGHEST", "LOWEST", "SUM"];
/** Pause between queued rolls so each one can be seen */
const QUEUE_DELAY_MS = 1200;
/** Give up on a roll that never settles */
const ROLL_TIMEOUT_MS = 20000;

interface ActiveRequest {
  id: string;
  roll: DiceRoll;
  dieIds: string[];
}

/** Convert a request into a dice roll with fresh die ids, throws on invalid input */
function buildDice(
  requested: RequestedDice,
  style: DiceStyle,
  depth: number,
  count: { value: number }
): Dice {
  if (!requested || !Array.isArray(requested.dice) || depth > 2) {
    throw Error("Invalid dice");
  }
  const dice: Dice = { dice: [] };
  for (const entry of requested.dice) {
    if (typeof entry === "string") {
      if (!DICE_TYPES.includes(entry)) {
        throw Error(`Unsupported die ${entry}`);
      }
      count.value += 1;
      dice.dice.push({ id: generateDiceId(), type: entry, style });
    } else {
      dice.dice.push(buildDice(entry, style, depth + 1, count));
    }
  }
  if (count.value > MAX_REQUESTED_DICE) {
    throw Error(`Too many dice (max ${MAX_REQUESTED_DICE})`);
  }
  if (requested.combination !== undefined) {
    if (!COMBINATIONS.includes(requested.combination)) {
      throw Error("Invalid combination");
    }
    dice.combination = requested.combination;
  }
  if (requested.bonus !== undefined) {
    if (!Number.isInteger(requested.bonus) || Math.abs(requested.bonus) > 999) {
      throw Error("Invalid bonus");
    }
    dice.bonus = requested.bonus;
  }
  return dice;
}

/** Value of every top level entry, a D10 showing 0 counts as 10 */
function getEntryValues(roll: DiceRoll, values: Record<string, number>) {
  return roll.dice.map((entry) => {
    if (isDie(entry)) {
      const value = values[entry.id];
      return value === 0 && entry.type === "D10" ? 10 : value;
    } else if (isDice(entry)) {
      return getCombinedDiceValue(entry, values) ?? 0;
    }
    return 0;
  });
}

/**
 * Listen for roll requests from other extensions and play them
 * through the dice roll store of the current window, one at a time.
 */
export function startRollRequestServer() {
  if (!window.BroadcastChannel) {
    return () => {};
  }
  const channel = new BroadcastChannel(API_CHANNEL);
  const send = (message: ApiMessage) => channel.postMessage(message);

  const queue: ActiveRequest[] = [];
  let active: ActiveRequest | null = null;
  let timeout: number | undefined;

  function next() {
    if (active || queue.length === 0) {
      return;
    }
    active = queue.shift()!;
    useDiceRollStore.getState().startRoll(active.roll);
    const request = active;
    timeout = window.setTimeout(() => {
      if (active === request) {
        send({ type: "error", id: request.id, message: "Roll timed out" });
        active = null;
        next();
      }
    }, ROLL_TIMEOUT_MS);
  }

  channel.onmessage = (event: MessageEvent) => {
    const message = event.data as ApiMessage;
    if (!message || typeof message !== "object" || typeof message.id !== "string") {
      return;
    }
    if (message.type === "ping") {
      send({ type: "pong", id: message.id, version: API_VERSION });
    } else if (message.type === "roll") {
      try {
        const style = DICE_STYLES.includes(message.style as DiceStyle)
          ? (message.style as DiceStyle)
          : DICE_STYLES[0];
        const dice = buildDice(message.roll, style, 0, { value: 0 });
        if (getDieFromDice(dice).length === 0) {
          throw Error("No dice to roll");
        }
        const roll: DiceRoll = { ...dice, hidden: Boolean(message.hidden) };
        queue.push({
          id: message.id,
          roll,
          dieIds: getDieFromDice(roll).map((die) => die.id),
        });
        next();
      } catch (e) {
        send({ type: "error", id: message.id, message: (e as Error).message });
      }
    }
  };

  const unsubscribe = useDiceRollStore.subscribe((state) => {
    if (!active || !state.roll) {
      return;
    }
    const ids = getDieFromDice(state.roll).map((die) => die.id);
    const isActiveRoll =
      ids.length === active.dieIds.length &&
      ids.every((id, index) => id === active!.dieIds[index]);
    if (!isActiveRoll) {
      return;
    }
    const values = Object.values(state.rollValues);
    if (values.length === 0 || values.some((value) => value === null)) {
      return;
    }
    const finished = state.rollValues as Record<string, number>;
    send({
      type: "result",
      id: active.id,
      total: getCombinedDiceValue(state.roll, finished) ?? 0,
      values: getEntryValues(state.roll, finished),
    });
    window.clearTimeout(timeout);
    active = null;
    window.setTimeout(next, QUEUE_DELAY_MS);
  });

  return () => {
    unsubscribe();
    window.clearTimeout(timeout);
    channel.close();
  };
}
