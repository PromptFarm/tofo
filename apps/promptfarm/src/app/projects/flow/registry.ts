import flowConfig from "../creation-flow.json";
import {
  draftStep,
  uploadFilesStep,
  nameStep,
  sessionStep,
  activateStep,
  intakeStreamStep,
  intakeUiStep,
  intakeSaveStep,
  redirectStep,
  directorConfirmStep,
  runSimulationStep,
} from "./steps";
import type { StepFn } from "./types";

export const STEPS: Record<string, StepFn> = {
  "draft":             draftStep,
  "upload-files":      uploadFilesStep,
  "name":              nameStep,
  "session":           sessionStep,
  "activate":          activateStep,
  "intake-stream":     intakeStreamStep,
  "intake-ui":         intakeUiStep,
  "intake-save":       intakeSaveStep,
  "redirect":          redirectStep,
  "director-confirm":  directorConfirmStep,
  "run-simulation":    runSimulationStep,
};

// Валидация при импорте: все step.id из JSON должны быть в реестре
const allStepIds = Object.values(flowConfig.flows).flatMap((flow) =>
  flow.steps.map((s) => s.id),
);
const missing = allStepIds.filter((id) => !(id in STEPS));
if (missing.length > 0) {
  const msg = `[flow] Unregistered steps in creation-flow.json: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "development") throw new Error(msg);
  else console.error(msg);
}
