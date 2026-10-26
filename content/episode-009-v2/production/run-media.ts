import {execFileSync} from 'node:child_process';
const script='content/episode-009-v2/production/media-pipeline.ts';
for(const stage of ['ingest','index','retrieve','verify']) {
 console.log('stage:',stage);
 execFileSync(process.execPath,['--import','tsx',script,stage],{stdio:'inherit'});
}
