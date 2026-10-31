import { spawnSync } from 'node:child_process';
const build = spawnSync(process.execPath, ['scripts/build.mjs'], {stdio:'inherit'});
if (build.status) process.exit(build.status);
await import('../server.mjs');
