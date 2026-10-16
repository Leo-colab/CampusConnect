import 'dotenv/config';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

const modelName = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export const aiStatus = () => ({ enabled: Boolean(openai), mode: openai ? 'live' : 'demo', model: openai ? modelName : null });

function cleanJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model returned an unexpected format.');
  return JSON.parse(raw.slice(start, end + 1));
}

const categoryMap = [
  [/earbud|headphone|charger|laptop|calculator|phone|tablet|electronic|cable/i, 'Electronics'],
  [/book|notebook|pen|stationery/i, 'Books & Stationery'],
  [/bag|backpack|rucksack/i, 'Bags & Backpacks'],
  [/shirt|jacket|hoodie|clothing|coat/i, 'Clothing'],
  [/id card|student card|document|badge|identity/i, 'ID Cards & Documents'],
  [/key|keyring/i, 'Keys'],
  [/wallet|purse|money|card holder/i, 'Wallets & Money'],
  [/watch|ring|jewelry|bracelet/i, 'Jewelry & Watches'],
  [/ball|racket|sports/i, 'Sports Equipment']
];

function inferCategory(text) {
  for (const [pattern, category] of categoryMap) if (pattern.test(text)) return category;
  return 'Other';
}

export function demoIdentify({ filename = '', title = '', description = '', category = '' } = {}) {
  const text = `${filename} ${title} ${description}`.replace(/[_-]/g, ' ');
  const colorMatch = text.match(/\b(black|white|blue|navy|red|green|teal|brown|grey|gray|pink|purple|yellow|silver|orange)\b/i);
  let object = title.trim() || filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]/g, ' ').trim();
  if (!object) object = 'unidentified personal item';
  const color = colorMatch?.[1]?.toLowerCase() || 'uncertain';
  const normalizedCategory = category || inferCategory(text);
  const attributes = [normalizedCategory.toLowerCase(), color, ...text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)].filter(Boolean);
  return {
    title: object.slice(0, 100),
    category: normalizedCategory,
    object,
    color,
    brand: null,
    visibleFeatures: [],
    visualSummary: `Demo mode: no live vision model is configured. Based on the text hints, this may be ${object.toLowerCase()}${color !== 'uncertain' ? ` in ${color}` : ''}. Review and correct these details.`,
    keywords: [...new Set(attributes)].slice(0, 12),
    confidence: 0.3,
    source: 'demo'
  };
}

export async function identifyImage(buffer, mimetype, filename, hints = {}) {
  if (!openai) return { ...demoIdentify({ filename, ...hints }), warning: 'Live AI is not configured. Demo analysis uses text hints, not computer vision.' };
  const base64 = buffer.toString('base64');
  const prompt = `You are the Visual Identification Agent for a university lost-and-found platform. Inspect the uploaded object photo. Do not identify people. If it shows an ID card, document, screen, address, barcode, or personal information, do not transcribe or reveal sensitive contents; describe only the generic object and non-sensitive visible attributes. Be conservative: do not invent a brand or model. Return JSON only with this schema: {"title":"short useful item title","category":"one of Electronics|Books & Stationery|Bags & Backpacks|Clothing|ID Cards & Documents|Keys|Wallets & Money|Jewelry & Watches|Sports Equipment|Other","object":"generic object type","color":"main visible color or uncertain","brand":null,"visibleFeatures":["up to 5 observable features"],"visualSummary":"one sentence visual description","keywords":["up to 12 descriptive words"],"confidence":0.0}. User hints: title=${hints.title || 'not supplied'}; description=${hints.description || 'not supplied'}; current category=${hints.category || 'not selected'}. Image filename: ${filename}.`;
  const response = await openai.responses.create({
    model: modelName,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: prompt },
      { type: 'input_image', image_url: `data:${mimetype};base64,${base64}`, detail: 'high' }
    ] }]
  });
  const result = cleanJson(response.output_text);
  return { ...result, source: 'openai', confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.65)) };
}

export async function answerCampusQuestion(message, items, matches) {
  if (openai) {
    const context = {
      reports: items.slice(0, 80).map(({ id, type, title, category, description, location, itemDate, status }) => ({ id, type, title, category, description, location, itemDate, status })),
      topCandidateMatches: matches.slice(0, 12).map(({ lostItem, foundItem, score, reasons }) => ({ lost: lostItem?.title, found: foundItem?.title, score, reasons }))
    };
    const response = await openai.responses.create({
      model: modelName,
      input: [
        { role: 'system', content: 'You are CampusConnect AI, an assistant for a university lost-and-found portal. Answer only from the supplied campus records. Never assert that a likely match proves ownership. Do not reveal private contact data. Suggest safe next steps and human verification for claims. If records do not answer, say so.' },
        { role: 'user', content: `Campus records: ${JSON.stringify(context)}\n\nStudent question: ${message}` }
      ]
    });
    return { answer: response.output_text || 'I could not form an answer from the available records.', source: 'openai' };
  }
  const terms = String(message).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const found = items.filter((item) => `${item.title} ${item.description} ${item.category} ${item.location}`.toLowerCase().split(/[^a-z0-9]+/).some((word) => terms.includes(word))).slice(0, 4);
  if (/how many|count|number of/i.test(message)) {
    const open = items.filter((item) => item.status === 'open');
    return { answer: `There are ${items.length} reports in the current campus dataset, and ${open.length} are still open. This is a ${aiStatus().mode === 'demo' ? 'demo dataset' : 'live-connected'} view.`, source: 'rules' };
  }
  if (found.length) {
    return { answer: `I found ${found.length} report${found.length === 1 ? '' : 's'} with related keywords:\n${found.map((item) => `• ${item.title} — ${item.type} · ${item.location} · ${item.status}`).join('\n')}\n\nThese are keyword suggestions, not verified identity matches. Open a report to submit a claim for human review.`, source: 'rules' };
  }
  const top = matches.slice(0, 3);
  return { answer: `I am running in Demo Mode, so I can search the current reports but cannot do live model reasoning until an API key is configured. Try including an item type, color, category, or campus location. ${top.length ? `There are ${top.length} possible match pair(s) available in the Matches view.` : ''}`, source: 'rules' };
}

function words(value) {
  return new Set(String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !['the', 'and', 'with', 'near', 'found', 'lost', 'item', 'this', 'that', 'from', 'have', 'has', 'was', 'for'].includes(word)));
}

function overlap(a, b) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const term of left) if (right.has(term)) common++;
  return common / (left.size + right.size - common);
}

function dateScore(a, b) {
  const ta = Date.parse(a || '');
  const tb = Date.parse(b || '');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0.45;
  const days = Math.abs(ta - tb) / 86400000;
  return Math.max(0, 1 - days / 10);
}

function visualText(item) {
  const a = item.aiAttributes || {};
  return [a.object, a.color, ...(a.visibleFeatures || []), a.visualSummary, ...(a.keywords || [])].filter(Boolean).join(' ');
}

function locationScore(a, b) {
  const exact = String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  if (exact && a) return 1;
  return Math.max(overlap(a, b), 0.08);
}

export function findMatches(items, threshold = 24) {
  const candidates = [];
  for (const first of items) {
    if (first.status !== 'open') continue;
    for (const second of items) {
      if (first.id >= second.id || second.status !== 'open' || first.type === second.type) continue;
      const lostItem = first.type === 'lost' ? first : second;
      const foundItem = first.type === 'found' ? first : second;
      const visual = overlap(visualText(lostItem), visualText(foundItem));
      const text = overlap(`${lostItem.title} ${lostItem.description}`, `${foundItem.title} ${foundItem.description}`);
      const category = lostItem.category === foundItem.category ? 1 : 0;
      const date = dateScore(lostItem.itemDate, foundItem.itemDate);
      const location = locationScore(lostItem.location, foundItem.location);
      const score = Math.round((visual * 0.40 + text * 0.25 + category * 0.10 + date * 0.10 + location * 0.15) * 100);
      if (score < threshold) continue;
      const reasons = [];
      if (visual >= 0.22) reasons.push('Similar object attributes and visual descriptions');
      if (text >= 0.18) reasons.push('Descriptions share meaningful terms');
      if (category) reasons.push(`Both reports are in ${lostItem.category}`);
      if (date >= 0.8) reasons.push('Reported within a few days of each other');
      if (location >= 0.55) reasons.push('Campus locations are close or share a building');
      candidates.push({ id: `match-${lostItem.id}-${foundItem.id}`, lostItemId: lostItem.id, foundItemId: foundItem.id, lostItem, foundItem, score, reasons, status: 'suggested', createdAt: new Date().toISOString(), scoreBreakdown: { visual: Math.round(visual * 100), text: Math.round(text * 100), category: category * 100, date: Math.round(date * 100), location: Math.round(location * 100) } });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function appendAgentRun(store, { agent, status = 'completed', summary, source = aiStatus().mode, durationMs = 0, metadata = {} }) {
  const run = { id: randomUUID(), agent, status, summary, source, durationMs, metadata, createdAt: new Date().toISOString() };
  store.agentRuns.unshift(run);
  store.agentRuns = store.agentRuns.slice(0, 150);
  return run;
}

export function createAgentPipeline(store, currentItem) {
  const start = Date.now();
  const matches = findMatches(store.items).filter((match) => match.lostItemId === currentItem.id || match.foundItemId === currentItem.id);
  const high = matches.filter((match) => match.score >= 45);
  appendAgentRun(store, { agent: 'Visual Identification Agent', summary: currentItem.aiAttributes?.source === 'openai' ? `Live vision analysis identified ${currentItem.aiAttributes.object || currentItem.title} and extracted visual attributes.` : `Demo attribute extraction prepared ${currentItem.aiAttributes?.keywords?.length || 0} searchable hints. Configure OPENAI_API_KEY for live image understanding.`, source: currentItem.aiAttributes?.source || 'demo', durationMs: Math.min(1900, Date.now() - start), metadata: { itemId: currentItem.id, confidence: currentItem.aiAttributes?.confidence || null } });
  appendAgentRun(store, { agent: 'Matchmaking Agent', summary: `Compared this report with opposite-type records and ranked ${matches.length} possible match(es).`, source: aiStatus().mode === 'live' ? 'hybrid' : 'demo', durationMs: 90 + matches.length * 13, metadata: { itemId: currentItem.id, candidateCount: matches.length, highPriorityCount: high.length } });
  for (const match of high.slice(0, 3)) {
    const other = match.lostItemId === currentItem.id ? match.foundItem : match.lostItem;
    const exists = store.notifications.some((notification) => notification.kind === 'match' && notification.itemId === other.id && notification.message.includes(currentItem.title));
    if (!exists) {
      store.notifications.unshift({ id: randomUUID(), title: 'Possible recovery match', message: `Your report may match “${currentItem.title}”. Similarity score: ${match.score}% (not proof of ownership).`, kind: 'match', read: false, createdAt: new Date().toISOString(), itemId: other.id });
    }
  }
  appendAgentRun(store, { agent: 'Recovery Workflow Agent', summary: high.length ? `Prepared ${high.length} recovery notification(s); all matches remain suggestions until the owner confirms.` : 'No high-confidence candidate met the notification threshold; the report remains searchable.', durationMs: 100, metadata: { itemId: currentItem.id, notificationsPrepared: high.length } });
  appendAgentRun(store, { agent: 'Claim Safety Agent', summary: 'Claim checks are human-reviewed. No ownership claims were auto-approved.', durationMs: 35, metadata: { itemId: currentItem.id, policy: 'human-in-the-loop' } });
  const campusCounts = store.items.reduce((map, item) => { map[item.location] = (map[item.location] || 0) + 1; return map; }, {});
  const busiest = Object.entries(campusCounts).sort((a, b) => b[1] - a[1])[0];
  appendAgentRun(store, { agent: 'Campus Intelligence Agent', summary: busiest ? `${busiest[0]} currently has the most reports in the visible dataset (${busiest[1]}).` : 'Waiting for more reports to provide location insights.', durationMs: 45, metadata: { uniqueLocations: Object.keys(campusCounts).length } });
  return matches;
}

export async function assessClaim(item, claim) {
  if (!openai) {
    const keyTerms = words(`${item.description} ${item.aiAttributes?.visibleFeatures?.join(' ') || ''}`);
    const answerTerms = words(claim.verificationAnswer);
    let hits = 0;
    for (const word of answerTerms) if (keyTerms.has(word)) hits++;
    const confidence = Math.min(0.8, 0.42 + hits * 0.09);
    return { confidence, note: 'Demo-mode heuristic only; it does not verify ownership. Owner/staff review required.', source: 'demo', flags: ['Human review required'] };
  }
  const prompt = `Assess a lost-and-found claim for triage only, not automatic approval. Compare the private item description and AI-visible attributes with the claimant answer. A weak answer does not prove fraud; avoid sensitive inference. Return JSON only: {"confidence":0.0,"note":"short evidence summary","flags":["..." ]}. Never recommend automatic approval. Item title: ${item.title}. Item category: ${item.category}. Private owner description: ${item.description}. Non-sensitive object attributes: ${JSON.stringify(item.aiAttributes || {})}. Claimant answer: ${claim.verificationAnswer}.`;
  const response = await openai.responses.create({ model: modelName, input: prompt });
  const result = cleanJson(response.output_text);
  return { confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)), note: result.note || 'Needs review.', flags: Array.isArray(result.flags) ? result.flags.slice(0, 5) : ['Human review required'], source: 'openai' };
}
