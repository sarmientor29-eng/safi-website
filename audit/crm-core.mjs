/**
 * SAFI CRM: pure lead scoring and follow-up scheduling helpers.
 * No external lookups or automated outreach. Human approval required.
 */
export const LEAD_STAGES = Object.freeze(["new","qualified","contacted","responded","meeting","quoted","won","lost"]);
export function normalizeLead(input) {
  if (!input || typeof input !== "object") throw new TypeError("Lead is required");
  const company=String(input.company || "").trim();
  const sourceUrl=String(input.sourceUrl || "").trim();
  const discoveredAt=String(input.discoveredAt || "").trim();
  if (!company) throw new RangeError("Company is required");
  if (!/^https?:\/\//i.test(sourceUrl)) throw new RangeError("Verifiable source URL required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(discoveredAt) || Number.isNaN(Date.parse(discoveredAt))) throw new RangeError("Discovery date required");
  const stage=input.stage || "new";
  if (!LEAD_STAGES.includes(stage)) throw new RangeError("Unknown stage");
  const priority=input.priority || "normal";
  if (!["low","normal","high"].includes(priority)) throw new RangeError("Unknown priority");
  return {company,sourceUrl,discoveredAt,stage,priority,location:String(input.location || "").trim(),service:String(input.service || "").trim(),notes:String(input.notes || "").trim(),contactConsentStatus:input.contactConsentStatus || "unverified",lastContactAt:null,nextFollowUpAt:null};
}
export function canSendCommercialEmail(lead) {
  // Conservative gate: does NOT determine CASL compliance; legal review is required.
  return Boolean(lead && lead.contactConsentStatus === "verified" && lead.approvedByHuman === true && lead.optedOut !== true && lead.senderIdentificationVerified === true && lead.unsubscribeMechanismVerified === true);
}
