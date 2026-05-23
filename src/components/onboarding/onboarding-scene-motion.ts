/** Shared enter animation for fullscreen onboarding scenes. */
export const ONBOARDING_SCENE_ENTER_CSS = `
@keyframes obSceneEnter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.ob-scene-enter {
  animation: obSceneEnter 420ms ease-out both;
}

@keyframes obSceneExit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.ob-scene-exit {
  animation: obSceneExit 400ms ease-in both;
  pointer-events: none;
}
`;

export const ONBOARDING_SCENE_EXIT_CSS = `
@keyframes obSceneExit {
  from { opacity: 1; }
  to { opacity: 0; }
}
.ob-scene-exit {
  animation: obSceneExit 400ms ease-in both;
  pointer-events: none;
}
`;

export const ONBOARDING_STREAM_TO_HORIZON_MS = 900;
