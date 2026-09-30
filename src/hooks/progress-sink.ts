"use client";

import { createContext } from "react";
import type { ProgressDelta } from "@/lib/progress";

/** Where action results send what they earned. No provider (or gamification off) → ignored. */
export const ProgressSinkContext = createContext<(delta: ProgressDelta) => void>(() => {});
