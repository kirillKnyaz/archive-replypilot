// service/enrichLead/enrichAndQualify.js
// Orchestrates the full enrichment + qualification pipeline for a single lead:
//   DISCOVERED → enrich identity → enrich contact → qualify → QUALIFIED / ARCHIVED

const prisma = require("../../lib/prisma");
const { enrichIdentity } = require("./identity");
const { enrichContact } = require("./contact");
const { qualifyLead } = require("./qualifyLead");

/**
 * Run the full enrichment pipeline for a lead, then qualify it against the campaign.
 *
 * @param {{ leadId: string, userId: string, campaign: object }} args
 * @returns {{ status: string, icpFitScore?: number, error?: string }}
 */
async function enrichAndQualifyLead({ leadId, userId, campaign }) {
  try {
    // Step 1: Enrich identity (scrape website → extract type, description, keywords)
    const identityResult = await enrichIdentity({ userId, leadId });
    const identityOk = !!identityResult?.updatedLead;
    if (!identityOk) {
      console.log(`[enrich] Identity enrichment incomplete for lead ${leadId}`);
    }

    // Step 2: Enrich contact (scrape website → extract email, phone, socials)
    const contactResult = await enrichContact({ userId, leadId });
    const contactOk = !!contactResult?.updatedLead;
    if (!contactOk) {
      console.log(`[enrich] Contact enrichment incomplete for lead ${leadId}`);
    }

    if (!identityOk && !contactOk) {
      console.log(`[enrich] Both enrichment steps failed for lead ${leadId} — archiving`);
      await prisma.lead.update({ where: { id: leadId }, data: { status: "ARCHIVED" } });
      return { status: "ARCHIVED", error: "No enrichment data found" };
    }

    // Step 3: Update status then reload so qualification sees fresh data
    await prisma.lead.update({ where: { id: leadId }, data: { status: "ENRICHED" } });
    const enrichedLead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!enrichedLead) {
      return { status: "ERROR", error: "Lead not found after enrichment" };
    }

    // Step 4: Qualify against campaign
    const qualification = await qualifyLead({ lead: enrichedLead, campaign });

    console.log(
      `[enrich] Lead "${enrichedLead.name}" → score: ${qualification.icpFitScore}, status: ${qualification.status}`
    );

    return {
      status: qualification.status,
      icpFitScore: qualification.icpFitScore,
      icpFitReason: qualification.icpFitReason,
      noContactFound: qualification.noContactFound,
    };
  } catch (e) {
    console.error(`[enrich] Pipeline failed for lead ${leadId}:`, e.message);
    return { status: "ERROR", error: e.message };
  }
}

module.exports = { enrichAndQualifyLead };
