export type SoundScene = {
  id: string;
  startFrame: number;
  durationFrames: number;
};

export type PokeSoundCue = {
  id: string;
  file: "message-pop.wav" | "impact.wav" | "pulse.wav";
  from: number;
  durationInFrames: number;
  volume: number;
};

const boundedCue = (
  scene: SoundScene | undefined,
  cue: Omit<PokeSoundCue, "from" | "durationInFrames">,
  offsetFrames = 0,
  requestedDuration = 20,
): PokeSoundCue | undefined => {
  if (!scene || offsetFrames < 0 || offsetFrames >= scene.durationFrames) return undefined;
  return {
    ...cue,
    from: scene.startFrame + offsetFrames,
    durationInFrames: Math.min(requestedDuration, scene.durationFrames - offsetFrames),
  };
};

export const buildPokeSoundCues = (scenes: SoundScene[]): PokeSoundCue[] => {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const cues: Array<PokeSoundCue | undefined> = [
    boundedCue(
      byId.get("seg-001"),
      {id: "message-seg-001", file: "message-pop.wav", volume: 0.55},
      0,
      20,
    ),
    ...["seg-002", "seg-009", "seg-011"].map((id) =>
      boundedCue(byId.get(id), {id: `impact-${id}`, file: "impact.wav", volume: 0.42}, 0, 32),
    ),
    boundedCue(
      byId.get("seg-008"),
      {id: "message-seg-008", file: "message-pop.wav", volume: 0.35},
      24,
      20,
    ),
  ];

  const pulseScene = byId.get("seg-010");
  if (pulseScene) {
    for (const [index, ratio] of [0.14, 0.29, 0.45, 0.6, 0.75].entries()) {
      const offset = Math.min(
        pulseScene.durationFrames - 1,
        Math.round(pulseScene.durationFrames * ratio),
      );
      cues.push(
        boundedCue(
          pulseScene,
          {id: `pulse-${index + 1}`, file: "pulse.wav", volume: 0.3},
          offset,
          20,
        ),
      );
    }
  }

  return cues.filter((cue): cue is PokeSoundCue => cue !== undefined);
};
