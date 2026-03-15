// service/runTracker.js
// In-memory tracker for active campaign runs.
// Buffers events so clients can reconnect and replay.

const activeRuns = new Map(); // campaignId → { events: [], listeners: Set, running: boolean }

function startRun(campaignId) {
  activeRuns.set(campaignId, { events: [], listeners: new Set(), running: true });
}

function emitEvent(campaignId, event) {
  const run = activeRuns.get(campaignId);
  if (!run) return;
  run.events.push(event);
  // Notify all connected listeners
  for (const listener of run.listeners) {
    listener(event);
  }
}

function endRun(campaignId) {
  const run = activeRuns.get(campaignId);
  if (!run) return;
  run.running = false;
  // Keep buffer for 60s so refreshes can still pick it up
  setTimeout(() => {
    const current = activeRuns.get(campaignId);
    if (current && !current.running) activeRuns.delete(campaignId);
  }, 60_000);
}

function getActiveRun(campaignId) {
  return activeRuns.get(campaignId) || null;
}

function addListener(campaignId, fn) {
  const run = activeRuns.get(campaignId);
  if (!run) return false;
  run.listeners.add(fn);
  return true;
}

function removeListener(campaignId, fn) {
  const run = activeRuns.get(campaignId);
  if (!run) return;
  run.listeners.delete(fn);
}

module.exports = { startRun, emitEvent, endRun, getActiveRun, addListener, removeListener };
