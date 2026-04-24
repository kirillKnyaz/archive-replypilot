// service/requalifyRunner.js
// Re-runs qualifyLead on existing campaign leads using current campaign config.
// Reuses the same progress event types as campaignRunner so the frontend
// LiveRunPanel displays identical UX.

const prisma = require("../lib/prisma");
const { qualifyLead } = require("./enrichLead/qualifyLead");

const noop = () => {};

/**
 * Re-score all ARCHIVED, QUEUED, and QUALIFIED leads for a campaign.
 * @param {object} campaign
 * @param {(event: { type: string, data: object }) => void} onProgress
 */
async function requalifyCampaign(campaign, onProgress = noop) {
  console.log(`[requalify] Starting requalify for campaign "${campaign.name}" (${campaign.id})`);

  const leads = await prisma.lead.findMany({
    where: {
      campaignId: campaign.id,
      userId: campaign.userId,
      status: { in: ["ARCHIVED", "QUEUED", "QUALIFIED"] },
    },
  });

  onProgress({
    type: "phase",
    data: { phase: "requalifying", message: `Requalifying ${leads.length} leads...`, total: leads.length },
  });

  let qualified = 0;
  let archived = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    onProgress({
      type: "enriching_lead",
      data: { index: i + 1, total: leads.length, leadName: lead.name, message: `Scoring: ${lead.name}` },
    });

    try {
      const result = await qualifyLead({ lead, campaign });
      if (result.status === "QUALIFIED") qualified++;
      else archived++;

      onProgress({
        type: "lead_qualified",
        data: {
          index: i + 1,
          total: leads.length,
          leadName: lead.name,
          status: result.status,
          icpFitScore: result.icpFitScore,
          qualified,
          archived,
          errors,
        },
      });
    } catch (e) {
      errors++;
      console.error(`[requalify] Failed for lead "${lead.name}":`, e.message);
    }
  }

  const summary = { qualified, archived, errors, total: leads.length };
  onProgress({ type: "complete", data: summary });

  console.log(
    `[requalify] Campaign "${campaign.name}" done — qualified: ${qualified}, archived: ${archived}, errors: ${errors}`
  );

  return summary;
}

module.exports = { requalifyCampaign };
