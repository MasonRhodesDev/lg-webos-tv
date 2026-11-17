import * as journal from './journal.mjs';
import { restoreVerified, closeAll } from './run.mjs';
import { restoreLayer, installStub, mounted } from './fallbacks.mjs';

export async function resolve(ctx, j) {
  ctx.say('restoring from the journal ' + j.file + ' (started ' + j.started + ')');
  const left = [];
  if (j.layer === 'broken') {
    const why = await restoreLayer(ctx);
    if (why) left.push('the good layer is not back: ' + why);
    else journal.mark(j, { layer: null });
  }
  if (j.stub === 'removed' && !left.length) {
    await installStub(ctx);
    if (await mounted(ctx)) journal.mark(j, { stub: null });
    else left.push('the stub is not mounted again');
  }
  if (!left.length) {
    const why = await closeAll(ctx).catch((e) => e.message);
    if (why) ctx.say('  ' + why);
    const r = await restoreVerified(ctx, j.baseline);
    left.push(...r.left);
    if (r.acted.length) ctx.say('  restored: ' + r.acted.join(', '));
  }
  if (left.length) throw new Error('the TV is not back to the journal\'s baseline: ' + left.join('; ') + '. Fix it by hand, then delete ' + j.file);
  journal.close(j);
  ctx.say('  the TV is back to the baseline, read back; journal closed');
}

export async function settle(ctx) {
  const j = journal.pending(ctx.tv.host);
  if (j) await resolve(ctx, j);
}
