1. Edit button is redundant — the name is already a link to the same page
Line 686 links to /leads/${lead.id}. Line 718 is a second link to the exact same route, labelled ✎. One of them must go. Keep the name link, kill the edit button.

2. "Maps" is a button that looks like a button but acts like a link
Line 713: <a> styled as btn btn-outline-secondary. The word "Maps" adds no information — the whole Maps column already implies it. A small icon or just "↗" would be cleaner, or make the cell itself a plain link with no button chrome.

3. Facebook renders a cleaned URL but you're displaying a full URL in a small column
Line 708 strips https://www. then truncates at 155px. The result is usually facebook.com/businessname in a tiny box. Users can't read it. Just show the handle (last path segment) or a fixed icon link — the full URL is noise.

4. The Actions column has 3 buttons but Edit is dead weight (see #1)
After removing Edit, the column has ↻ and ×. You can then make Actions much narrower — it currently reserves minWidth: 110 for 3 buttons that will be 2.

5. NullableFilter component for 3 identical dropdowns — not clutter visually but is speculative abstraction
It's a 4-line component used three times with only the label different. Inline it — it's less total code and one less thing to mentally track. Per SRERS: no abstractions for one-off repetition unless they earn it.

6. SortTh component — same issue
8 uses, but the component is 11 lines and its only job is adding ↑/↓/⇅ and a cursor. That's arguably worth keeping because the sort indicator logic is non-trivial. Borderline — your call.

7. Score filter has 5 options but most are never used
"Has score" / "No score" / ≥8 / ≥6 / ≥4 — that's 5 options in a 70px column. The ≥4 threshold is meaningless (everything above 0 qualifies). Trim to: Any / No score / ≥8 / ≥6.

8. Status filter has 6 options including ENRICHED and DISCOVERED which are auto-states you rarely search for manually
You'll typically want QUALIFIED / QUEUED / CONTACTED / ARCHIVED. DISCOVERED and ENRICHED are intermediate pipeline states — surfacing them in the filter adds length without value.

9. The hasContact sticky-cell background computation is inline and fragile
Line 685: background: hasContact ? "white" : "rgba(255,255,255,0.45)". This is fighting the opacity: 0.45 set on the <tr>. You can't apply opacity to a <tr> and then override the background of a sticky <td> inside it cleanly — the stuck cell will look different from the rest of the row. Just let opacity do its job on the <tr>, and set the sticky <td> background to plain white always.

10. Comment on line 601: {/* Column headers — click to sort */} is noise
The sort arrows on every header already communicate that. Same with {/* Filter row — visually separated from headers */} on line 621 — the borderTop style and visual separation say it. Delete both.

11. bulkWorking is not set for bulkRescrape
The Re-scrape button has no disabled={bulkWorking} — but more importantly, bulkWorking is only for status/delete operations. The scraping state is already tracked per-ID in scrapingIds. bulkWorking is only needed for the status/delete buttons; the rescrape button correctly uses scrapingIds implicitly. Not visual clutter, but a consistency gap.

Summary of cuts I'd make:

Remove the Edit button (saves a button per row × N rows)
Remove DISCOVERED and ENRICHED from status filter
Remove the ≥4 score option
Replace the Facebook URL display with just the path handle
Inline NullableFilter
Fix the sticky-cell background (remove the conditional)
Delete the two inline comments