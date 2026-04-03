// service/campaignRunner.js
// Orchestrates the daily campaign run pipeline.
// 1. Discover ALL new businesses via Places API (no cap)
// 2. Create Lead records for all discovered
// 3. Enrich + qualify every lead
// 4. Generate outreach messages for top N qualified leads (by icpFitScore)
// 5. Log results to CampaignRun
//
// Accepts an optional `onProgress` callback for live SSE streaming.

const prisma = require("../lib/prisma");
const { discoverPlaces, createLeadsFromPlaces } = require("./searchPlaces");
const { enrichAndQualifyLead } = require("./enrichLead/enrichAndQualify");
const { generateMessage } = require("./generateMessage");

// No-op progress callback
const noop = () => {};

/**
 * Run a single campaign with optional live progress.
 * @param {object} campaign
 * @param {(event: { type: string, data: object }) => void} onProgress
 */
async function runCampaign(campaign, onProgress = noop) {
  const missing = ['vertical', 'location', 'offer', 'userId'].filter((f) => !campaign[f]);
  if (missing.length > 0) {
    const err = `Campaign is missing required fields: ${missing.join(', ')}`;
    console.error(`[runner] ${err}`);
    onProgress({ type: 'error', data: { error: err } });
    return { error: err };
  }

  console.log(`[runner] Starting run for campaign "${campaign.name}" (${campaign.id})`);

  const run = await prisma.campaignRun.create({
    data: {
      campaignId: campaign.id,
      status: "RUNNING",
    },
  });

  onProgress({ type: "run_started", data: { runId: run.id, campaign: campaign.name } });

  try {
    // Step 1: Discover new places
    onProgress({ type: "phase", data: { phase: "discovering", message: "Searching Google Places..." } });
    const { discovered, filtered, places } = await discoverPlaces(campaign);
    onProgress({
      type: "discovery_complete",
      data: { discovered, filtered, newPlaces: places.length },
    });

    // Step 2: Create leads for ALL new places
    onProgress({ type: "phase", data: { phase: "creating_leads", message: `Creating ${places.length} leads...` } });
    const created = await createLeadsFromPlaces(campaign, places);
    onProgress({ type: "leads_created", data: { created } });

    // Step 3: Enrich + qualify ALL newly created DISCOVERED leads
    const newLeads = await prisma.lead.findMany({
      where: {
        campaignId: campaign.id,
        userId: campaign.userId,
        status: "DISCOVERED",
      },
    });

    onProgress({
      type: "phase",
      data: { phase: "enriching", message: `Enriching ${newLeads.length} leads...`, total: newLeads.length },
    });

    let qualified = 0;
    let archived = 0;
    let enrichErrors = 0;

    for (let i = 0; i < newLeads.length; i++) {
      const lead = newLeads[i];
      onProgress({
        type: "enriching_lead",
        data: {
          index: i + 1,
          total: newLeads.length,
          leadName: lead.name,
          message: `Enriching: ${lead.name}`,
        },
      });

      const result = await enrichAndQualifyLead({
        leadId: lead.id,
        userId: campaign.userId,
        campaign,
      });

      if (result.status === "QUALIFIED") qualified++;
      else if (result.status === "ARCHIVED") archived++;
      else enrichErrors++;

      onProgress({
        type: "lead_qualified",
        data: {
          index: i + 1,
          total: newLeads.length,
          leadName: lead.name,
          status: result.status,
          icpFitScore: result.icpFitScore,
          qualified,
          archived,
          errors: enrichErrors,
        },
      });
    }

    // Step 4: Generate messages for top N qualified leads
    const topQualified = await prisma.lead.findMany({
      where: {
        campaignId: campaign.id,
        status: "QUALIFIED",
      },
      orderBy: { icpFitScore: "desc" },
      take: campaign.dailyTarget,
    });

    onProgress({
      type: "phase",
      data: { phase: "generating_messages", message: `Writing messages for ${topQualified.length} leads...`, total: topQualified.length },
    });

    let queued = 0;
    for (let i = 0; i < topQualified.length; i++) {
      const lead = topQualified[i];
      onProgress({
        type: "generating_message",
        data: {
          index: i + 1,
          total: topQualified.length,
          leadName: lead.name,
          message: `Writing message: ${lead.name}`,
        },
      });

      try {
        await generateMessage({ lead, campaign });
        queued++;
        onProgress({
          type: "message_generated",
          data: {
            index: i + 1,
            total: topQualified.length,
            leadName: lead.name,
            queued,
          },
        });
      } catch (e) {
        console.error(`[runner] Message generation failed for lead "${lead.name}":`, e.message);
        onProgress({
          type: "message_error",
          data: { leadName: lead.name, error: e.message },
        });
      }
    }

    // Update run record
    await prisma.campaignRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETE",
        leadsDiscovered: discovered,
        leadsFiltered: filtered,
        leadsQueued: queued,
      },
    });

    const summary = { runId: run.id, discovered, filtered, created, qualified, queued, archived, enrichErrors };

    onProgress({ type: "complete", data: summary });

    console.log(
      `[runner] Campaign "${campaign.name}" complete — discovered: ${discovered}, filtered: ${filtered}, created: ${created}, qualified: ${qualified}, queued: ${queued}, archived: ${archived}, errors: ${enrichErrors}`
    );

    return summary;
  } catch (e) {
    console.error(`[runner] Campaign "${campaign.name}" failed:`, e.message);

    await prisma.campaignRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        errorMessage: e.message?.slice(0, 500),
      },
    });

    onProgress({ type: "error", data: { error: e.message } });

    return { runId: run.id, error: e.message };
  }
}

/**
 * Run all active campaigns that have completed setup.
 */
async function runAllCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    where: { active: true, setupComplete: true },
  });

  if (campaigns.length === 0) {
    console.log("[runner] No active campaigns to run.");
    return [];
  }

  console.log(`[runner] Running ${campaigns.length} active campaign(s)...`);

  const results = [];
  for (const campaign of campaigns) {
    const result = await runCampaign(campaign);
    results.push({ campaignId: campaign.id, name: campaign.name, ...result });
  }

  return results;
}

module.exports = { runCampaign, runAllCampaigns };
