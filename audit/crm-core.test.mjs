import test from "node:test";
import assert from "node:assert/strict";
import {normalizeLead,canSendCommercialEmail} from "./crm-core.mjs";
test("requires source and discovery date",()=>{
 assert.throws(()=>normalizeLead({company:"Example",discoveredAt:"2026-11-08"}),RangeError);
 const lead=normalizeLead({company:"Example",sourceUrl:"https://example.com/project",discoveredAt:"2026-11-08"});
 assert.equal(lead.stage,"new");
 assert.equal(lead.contactConsentStatus,"unverified");
 assert.equal(canSendCommercialEmail(lead),false);
});
test("commercial email requires explicit verified gates",()=>{
 const lead={contactConsentStatus:"verified",approvedByHuman:true,optedOut:false,senderIdentificationVerified:true,unsubscribeMechanismVerified:true};
 assert.equal(canSendCommercialEmail(lead),true);
 assert.equal(canSendCommercialEmail({...lead,optedOut:true}),false);
});
