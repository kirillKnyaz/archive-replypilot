const leadId = window.name;
if (!leadId) return; // not opened from ReplyPilot

function findPhone() {
  const el = document.querySelector('a[href^="tel:"]');
  return el ? el.href.replace('tel:', '') : null;
}

let attempts = 0;
const poll = setInterval(() => {
  const phone = findPhone();
  if (phone) {
    clearInterval(poll);
    window.opener?.postMessage({ type: 'REPLYPILOT_PHONE', leadId, phone }, '*');
    window.close();
  }
  if (++attempts > 20) clearInterval(poll); // stop after 10s
}, 500);
