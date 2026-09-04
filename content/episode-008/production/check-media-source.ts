import fs from "node:fs";
import {proposeMediaSource} from "../../../src/media/discovery";
import {repoRoot} from "../../../src/lib/episode/paths";

// Reproduce the default production discovery boundary without overriding its policy.
const sources = [
  {
    sourceId: "episode-008:media-source:lovable-office-hours",
    sourceUrl: "https://www.youtube.com/watch?v=47sKfUOqARY",
    publisher: "Lovable",
    sourceType: "official" as const,
    rightsBasis: "Official embed located; clip reuse rights not yet approved.",
    notes: "Research previews inspected: 29:54–30:18 and 42:15–42:57; 1080p login, save, refresh and database records. No formal ingest or rights approval.",
  },
  {
    sourceId: "episode-008:media-source:lovable-founders",
    sourceUrl: "https://lovablebrand.lovable.app/__l5e/assets-v1/96eb544c-df27-4c29-bb0c-c0aefb486268/Anton_Fabian_studio.jpg",
    publisher: "Lovable",
    sourceType: "official" as const,
    rightsBasis: "Brand photos page permits press and editorial coverage; production admission still pending.",
    notes: "Discovery copy and rights screenshot preserved; not a formally admitted MediaAsset.",
  },
];
const results = sources.map((source) => {
  try {
    const result = proposeMediaSource({repoRoot, episodeId: "episode-008", source});
    return {sourceId: source.sourceId, status: "proposed", manifestVersion: result.version};
  } catch (error) {
    return {sourceId: source.sourceId, status: "blocked", error: error instanceof Error ? error.message : String(error)};
  }
});
fs.writeFileSync(`${repoRoot}/content/episode-008/production/logs/media-discovery.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.status === "blocked")) process.exitCode = 1;
