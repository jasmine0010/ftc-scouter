// Cloudflare Worker: the team's shared sync service for the GitHub Pages app.
// One Durable Object holds the dataset, so saves from many phones are applied
// one at a time and nothing is lost to two devices writing at once.
import { DurableObject } from "cloudflare:workers";
import { TeamStoreCore, handle } from "./core.mjs";

export class TeamStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new TeamStoreCore(ctx.storage);
  }
  async sync(input) {
    return this.core.sync(input);
  }
}

export default {
  fetch(request, env) {
    const store = () => env.TEAM_STORE.get(env.TEAM_STORE.idFromName("team"));
    return handle(request, env, {
      sync: (input) => store().sync(input),
      fetch: (...args) => fetch(...args),
    });
  },
};
