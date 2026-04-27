function hours(n) { return new Date(Date.now() + n * 3_600_000); }
function days(n)  { return hours(n * 24); }

function computeNextFollowUp({ channel, result, reachCount }) {
  if (channel === 'PHONE') {
    if (result === 'NO_ANSWER')           return reachCount <= 1
      ? { nextFollowUpAt: hours(48), suggestedAction: 'Call again, different time' }
      : { nextFollowUpAt: hours(24), suggestedAction: 'Switch to email or DM' };
    if (result === 'VOICEMAIL')           return { nextFollowUpAt: hours(4),  suggestedAction: 'Send email referencing voicemail' };
    if (result === 'CONVERSATION')        return { nextFollowUpAt: hours(1),  suggestedAction: 'Send recap email' };
    if (result === 'FOLLOW_UP_REQUESTED') return { nextFollowUpAt: days(7),   suggestedAction: 'Call back as promised' };
    if (result === 'POSITIVE')            return { nextFollowUpAt: hours(24), suggestedAction: 'Send mockup or proposal' };
    if (result === 'NOT_NOW')             return { nextFollowUpAt: days(60),  suggestedAction: 'Re-engage' };
    if (result === 'GATEKEEPER')          return { nextFollowUpAt: hours(24), suggestedAction: 'Call again, ask for owner' };
    if (result === 'NEGATIVE' || result === 'DO_NOT_CONTACT') return { nextFollowUpAt: null, suggestedAction: null };
    return { nextFollowUpAt: days(1), suggestedAction: 'Follow up' };
  }

  if (channel === 'EMAIL') {
    if (result === 'NO_ANSWER') {
      if (reachCount <= 1) return { nextFollowUpAt: hours(72), suggestedAction: 'Follow up, different angle' };
      if (reachCount === 2) return { nextFollowUpAt: days(4),  suggestedAction: 'Final short message' };
      return { nextFollowUpAt: days(60), suggestedAction: 'Dormant' };
    }
    if (result === 'POSITIVE')            return { nextFollowUpAt: new Date(), suggestedAction: 'Respond immediately' };
    if (result === 'FOLLOW_UP_REQUESTED') return { nextFollowUpAt: days(7),   suggestedAction: 'Follow up as promised' };
    if (result === 'NOT_NOW')             return { nextFollowUpAt: days(60),  suggestedAction: 'Re-engage' };
    if (result === 'NEGATIVE' || result === 'DO_NOT_CONTACT') return { nextFollowUpAt: null, suggestedAction: null };
    return { nextFollowUpAt: days(3), suggestedAction: 'Follow up' };
  }

  if (channel === 'DM') {
    if (result === 'NO_ANSWER') return { nextFollowUpAt: hours(48), suggestedAction: 'Switch channel' };
    if (result === 'POSITIVE')  return { nextFollowUpAt: new Date(), suggestedAction: 'Move to email — get their address' };
    if (result === 'NOT_NOW')   return { nextFollowUpAt: days(60),  suggestedAction: 'Re-engage' };
    if (result === 'NEGATIVE' || result === 'DO_NOT_CONTACT') return { nextFollowUpAt: null, suggestedAction: null };
    return { nextFollowUpAt: days(2), suggestedAction: 'Follow up' };
  }

  if (channel === 'DROP_IN') {
    if (result === 'POSITIVE')     return { nextFollowUpAt: hours(2),  suggestedAction: 'Send follow-up email referencing meeting' };
    if (result === 'CONVERSATION') return { nextFollowUpAt: hours(4),  suggestedAction: 'Send recap email' };
    if (result === 'GATEKEEPER')   return { nextFollowUpAt: hours(24), suggestedAction: 'Go back, ask for owner' };
    if (result === 'NEGATIVE' || result === 'DO_NOT_CONTACT') return { nextFollowUpAt: null, suggestedAction: null };
    return { nextFollowUpAt: days(1), suggestedAction: 'Go back at suggested time' };
  }

  return { nextFollowUpAt: days(1), suggestedAction: 'Follow up' };
}

module.exports = { computeNextFollowUp };
