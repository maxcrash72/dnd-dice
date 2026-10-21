import OBR from "@owlbear-rodeo/sdk";
import { Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import ButtonBase from "@mui/material/ButtonBase";

import environment from "../environment.hdr";
import { AudioListenerProvider } from "../audio/AudioListenerProvider";
import { Tray } from "../tray/Tray";
import { TraySuspense } from "../tray/TraySuspense";
import { AnimatedPlayerCamera } from "./AnimatedPlayerCamera";
import { DiceRoll } from "../dice/DiceRoll";
import { useDiceRollStore } from "../dice/store";
import { DiceTransform } from "../types/DiceTransform";
import { getCombinedDiceValue } from "../helpers/getCombinedDiceValue";
import { startRollRequestServer } from "../api/rollRequests";

export const SELF_TRAY_ID = "self";

/**
 * Popover tray for dice rolled on behalf of this player by another extension
 * (see `api/protocol.ts`). It runs the physics simulation locally, the result
 * is synced to the party by `DiceRollSync` like any other roll.
 */
export function SelfTray({
  onToggle,
}: {
  onToggle: (id: string, show: boolean) => void;
}) {
  useEffect(() => startRollRequestServer(), []);

  const roll = useDiceRollStore((state) => state.roll);
  const rollThrows = useDiceRollStore((state) => state.rollThrows);
  const rollValues = useDiceRollStore((state) => state.rollValues);
  const finishDieRoll = useDiceRollStore((state) => state.finishDieRoll);

  const finishedTransforms = useDiceRollStore((state) => {
    const values = Object.values(state.rollTransforms);
    if (values.length === 0 || values.some((v) => v === null)) {
      return undefined;
    }
    return state.rollTransforms as Record<string, DiceTransform>;
  });

  const transformsRef = useRef<Record<string, DiceTransform | null> | null>(
    null
  );
  useEffect(
    () =>
      useDiceRollStore.subscribe((state) => {
        transformsRef.current = state.rollTransforms;
      }),
    []
  );

  const finishedRolling = Boolean(finishedTransforms);
  const finalValue = useMemo(() => {
    if (roll && finishedRolling) {
      return getCombinedDiceValue(roll, rollValues as Record<string, number>);
    }
    return null;
  }, [roll, rollValues, finishedRolling]);

  const [name, setName] = useState("");
  useEffect(() => {
    if (!OBR.isAvailable) {
      return;
    }
    OBR.player.getName().then(setName);
    return OBR.player.onChange((player) => setName(player.name));
  }, []);

  // Hide the tray a few seconds after the dice settle
  const [timedOut, setTimedOut] = useState(true);
  useEffect(() => {
    if (!roll) {
      setTimedOut(true);
    } else if (finishedRolling) {
      const timeout = setTimeout(() => setTimedOut(true), 5000);
      return () => clearTimeout(timeout);
    } else {
      setTimedOut(false);
    }
  }, [roll, finishedRolling]);

  const shown = Boolean(roll) && !timedOut;
  useEffect(() => {
    if (shown) {
      onToggle(SELF_TRAY_ID, true);
    }
  }, [shown]);

  const theme = useTheme();

  return (
    <Box component="div" position="absolute" right={16} bottom={16}>
      <Slide
        in={shown}
        onExited={() => onToggle(SELF_TRAY_ID, false)}
        direction="up"
      >
        <ButtonBase onClick={() => setTimedOut(true)}>
          <Paper
            elevation={8}
            sx={{
              width: "250px",
              height: "282px",
              borderRadius: 2,
              overflow: "hidden",
              backgroundColor:
                theme.palette.mode === "dark"
                  ? "rgba(34, 38, 57, 0.8)"
                  : "rgba(255, 255, 255, 0.4)",
            }}
          >
            <Box component="div" height="250px" width="250px">
              <TraySuspense>
                <Canvas frameloop="demand">
                  <AudioListenerProvider volume={0.5}>
                    <Environment files={environment} />
                    <Tray />
                    {roll && (
                      <DiceRoll
                        roll={roll}
                        rollThrows={rollThrows}
                        finishedTransforms={finishedTransforms}
                        onRollFinished={finishDieRoll}
                        transformsRef={transformsRef}
                      />
                    )}
                    <AnimatedPlayerCamera rollTransforms={finishedTransforms} />
                  </AudioListenerProvider>
                </Canvas>
              </TraySuspense>
            </Box>
            <Typography
              variant="subtitle1"
              color="text.secondary"
              textAlign="center"
              lineHeight="32px"
              sx={{
                bgcolor: "background.default",
              }}
              noWrap
            >
              {name}
              {roll?.hidden && <span> (hidden)</span>}
              {finalValue !== null && <span> | {finalValue}</span>}
            </Typography>
          </Paper>
        </ButtonBase>
      </Slide>
    </Box>
  );
}
