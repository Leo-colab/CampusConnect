import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DATA_DIR, UPLOAD_DIR, ensureDirectories, connectStore, saveStore, closeStore
} from './store.js';
import {
  aiStatus, identifyImage, demoIdentify, findMatches, createAgentPipeline,
  appendAgentRun, answerCampusQuestion, assessClaim
} from './agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
ensureDirectories();

app.use(cors({ origin: CLIENT_ORIGIN.split(',').map((entry) => entry.trim()), credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h', dotfiles: 'deny', immutable: false }));

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      callback(new Error('Please upload a JPG, PNG, WEBP or GIF image.'));
      return;
    }
    callback(null, true);
  }
});

let store;
const persist = async () => {
  try {
    await saveStore(store);
  } catch (error) {
    console.error('MongoDB persistence failed:', error.message);
    throw Object.assign(new Error('Data could not be saved to MongoDB. Please try again.'), { statusCode: 500 });
  }
};
const now = () => new Date().toISOString();
const safeText = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const notFound = (res) => res.status(404).json({ error: 'That record could not be found.' });
const itemById = (id) => store.items.find((item) => item.id === id);
const publicItem = (item) => {
  if (!item) return null;
  const { contactInfo, ownerEmail, ownerName, aiAttributes, ...safe } = item;
  return { ...safe, aiAttributes: aiAttributes ? { ...aiAttributes, brand: aiAttributes.brand || null } : null };
};

function stats() {
  const items = store.items;
  const open = items.filter((item) => item.status === 'open');
  const categoryCounts = {};
  const locationCounts = {};
  for (const item of items) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    locationCounts[item.location] = (locationCounts[item.location] || 0) + 1;
  }
  return {
    total: items.length,
    lost: items.filter((item) => item.type === 'lost').length,
    found: items.filter((item) => item.type === 'found').length,
    open: open.length,
    recovered: items.filter((item) => item.status === 'claimed' || item.status === 'closed').length,
    pendingClaims: store.claims.filter((claim) => claim.status === 'pending').length,
    highMatches: findMatches(items).filter((match) => match.score >= 45).length,
    categoryCounts,
    locationCounts,
    recentItems: [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(publicItem)
  };
}

async function analyzeSafely(file, hints) {
  try {
    if (!file) return { attributes: demoIdentify(hints), warning: aiStatus().enabled ? null : 'No image provided.' };
    const attributes = await identifyImage(file.buffer, file.mimetype, file.originalname, hints);
    return { attributes, warning: attributes.warning || null };
  } catch (error) {
    console.error('Image identification failed:', error.message);
    return {
      attributes: { ...demoIdentify({ filename: file?.originalname, ...hints }), source: 'demo' },
      warning: `Live image analysis failed, so the report can still be saved in Demo Mode. ${error.message}`
    };
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'MongoDB', ...aiStatus(), app: 'CampusConnect AI' }));
app.get('/api/dashboard', (_req, res) => res.json(stats()));

app.get('/api/items', (req, res) => {
  const type = ['lost', 'found'].includes(req.query.type) ? req.query.type : null;
  const category = safeText(req.query.category, 100);
  const q = safeText(req.query.q, 200).toLowerCase();
  const items = [...store.items]
    .filter((item) => !type || item.type === type)
    .filter((item) => !category || category === 'all' || item.category === category)
    .filter((item) => !q || `${item.title} ${item.description} ${item.category} ${item.location} ${item.aiAttributes?.keywords?.join(' ') || ''}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items: items.map(publicItem), count: items.length });
});

app.get('/api/items/:id', (req, res) => {
  const item = itemById(req.params.id);
  if (!item) return notFound(res);
  const related = findMatches(store.items).filter((match) => match.lostItemId === item.id || match.foundItemId === item.id).slice(0, 8);
  res.json({ item: publicItem(item), matches: related.map((match) => ({ ...match, lostItem: publicItem(match.lostItem), foundItem: publicItem(match.foundItem) })) });
});

app.post('/api/ai/identify', imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image first.' });
  const hints = { title: safeText(req.body.title, 120), description: safeText(req.body.description, 2000), category: safeText(req.body.category, 80) };
  const result = await analyzeSafely(req.file, hints);
  appendAgentRun(store, {
    agent: 'Visual Identification Agent',
    summary: result.attributes.source === 'openai' ? `Live model analyzed an uploaded photo and proposed “${result.attributes.title || result.attributes.object || 'an item'}”.` : 'Demo analysis used available text hints. Configure an API key for real image understanding.',
    source: result.attributes.source,
    durationMs: 0,
    metadata: { preview: true, warning: result.warning || null }
  });
  await persist();
  res.json({ attributes: result.attributes, mode: result.attributes.source === 'openai' ? 'live' : 'demo', warning: result.warning });
});

app.post('/api/items', imageUpload.single('image'), async (req, res) => {
  const type = ['lost', 'found'].includes(req.body.type) ? req.body.type : null;
  const title = safeText(req.body.title, 120);
  const description = safeText(req.body.description, 2000);
  const category = safeText(req.body.category, 80);
  const location = safeText(req.body.location, 160);
  const itemDate = safeText(req.body.itemDate, 20);
  const ownerName = safeText(req.body.ownerName, 100) || 'Campus student';
  const ownerEmail = safeText(req.body.ownerEmail, 160);
  const contactInfo = safeText(req.body.contactInfo, 160);
  if (!type || title.length < 3 || description.length < 10 || !category || location.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) {
    return res.status(400).json({ error: 'Please complete the item type, title, description, category, location and date.' });
  }
  if (!req.file && !description) return res.status(400).json({ error: 'Add a short item description.' });

  const file = req.file;
  let imageUrl = null;
  if (file) {
    const extensionByMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    const imageName = `${randomUUID()}${extensionByMime[file.mimetype] || '.img'}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, imageName), file.buffer);
    imageUrl = `/uploads/${imageName}`;
  }

  const analysis = await analyzeSafely(file, { title, description, category });
  const aiAttributes = analysis.attributes || demoIdentify({ title, description, category });
  const item = {
    id: randomUUID(), type, title, description, category, location, itemDate,
    contactInfo: contactInfo || '', imageUrl, status: 'open', createdAt: now(),
    ownerName, ownerEmail, aiAttributes,
    aiWarning: analysis.warning || null
  };
  if ((!title || title.length < 3) && aiAttributes.title) item.title = aiAttributes.title;
  store.items.unshift(item);
  const matchCandidates = createAgentPipeline(store, item);
  await persist();
  res.status(201).json({ item: publicItem(item), candidates: matchCandidates.slice(0, 5).map((match) => ({ ...match, lostItem: publicItem(match.lostItem), foundItem: publicItem(match.foundItem) })), warning: analysis.warning, mode: aiAttributes.source === 'openai' ? 'live' : 'demo' });
});

app.post('/api/items/:id/reprocess', async (req, res) => {
  const item = itemById(req.params.id);
  if (!item) return notFound(res);
  if (item.imageUrl?.startsWith('/uploads/')) {
    const imagePath = path.join(UPLOAD_DIR, path.basename(item.imageUrl));
    if (fs.existsSync(imagePath)) {
      const buffer = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimetype = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' })[ext] || 'image/jpeg';
      const analysis = await analyzeSafely({ buffer, mimetype, originalname: path.basename(imagePath) }, item);
      item.aiAttributes = analysis.attributes;
      item.aiWarning = analysis.warning;
    }
  }
  const matches = createAgentPipeline(store, item);
  await persist();
  res.json({ item: publicItem(item), candidates: matches.slice(0, 8).map((match) => ({ ...match, lostItem: publicItem(match.lostItem), foundItem: publicItem(match.foundItem) })) });
});

app.get('/api/matches', (_req, res) => {
  const computed = findMatches(store.items);
  const active = computed.map((match) => {
    const reviewed = store.matchReviews?.find((review) => review.lostItemId === match.lostItemId && review.foundItemId === match.foundItemId);
    return { ...match, status: reviewed?.status || 'suggested', reviewNote: reviewed?.note || null, lostItem: publicItem(match.lostItem), foundItem: publicItem(match.foundItem) };
  });
  const currentKeys = new Set(active.map((match) => `${match.lostItemId}::${match.foundItemId}`));
  const historical = (store.matchReviews || []).filter((review) => ['resolved', 'dismissed'].includes(review.status) && !currentKeys.has(`${review.lostItemId}::${review.foundItemId}`)).map((review) => {
    const lostItem = itemById(review.lostItemId);
    const foundItem = itemById(review.foundItemId);
    if (!lostItem || !foundItem) return null;
    return { id: `match-${lostItem.id}-${foundItem.id}`, lostItemId: lostItem.id, foundItemId: foundItem.id, lostItem: publicItem(lostItem), foundItem: publicItem(foundItem), score: review.score || 0, reasons: review.reasons || [], status: review.status, reviewNote: review.note || null, scoreBreakdown: review.scoreBreakdown || {}, createdAt: review.updatedAt };
  }).filter(Boolean);
  const matches = [...active, ...historical].sort((a,b) => b.score - a.score);
  res.json({ matches, count: matches.length });
});

app.post('/api/matches/:lostId/:foundId/review', async (req, res) => {
  const lost = itemById(req.params.lostId);
  const found = itemById(req.params.foundId);
  if (!lost || !found || lost.type !== 'lost' || found.type !== 'found') return res.status(400).json({ error: 'A valid lost/found pair is required.' });
  const status = ['reviewing', 'dismissed', 'resolved'].includes(req.body.status) ? req.body.status : 'reviewing';
  const note = safeText(req.body.note, 500);
  const candidate = findMatches(store.items).find((match) => match.lostItemId === lost.id && match.foundItemId === found.id);
  store.matchReviews ||= [];
  const existing = store.matchReviews.find((review) => review.lostItemId === lost.id && review.foundItemId === found.id);
  const reviewData = { status, note, updatedAt: now(), score: candidate?.score || existing?.score || 0, reasons: candidate?.reasons || existing?.reasons || [], scoreBreakdown: candidate?.scoreBreakdown || existing?.scoreBreakdown || {} };
  if (existing) Object.assign(existing, reviewData);
  else store.matchReviews.unshift({ id: randomUUID(), lostItemId: lost.id, foundItemId: found.id, ...reviewData });
  appendAgentRun(store, { agent: 'Recovery Workflow Agent', summary: `A human reviewer changed “${lost.title}” ↔ “${found.title}” to ${status}.`, metadata: { lostItemId: lost.id, foundItemId: found.id, status } });
  if (status === 'resolved') {
    // This endpoint is an explicit human-review action. Only then are reports closed as recovered.
    lost.status = 'closed';
    found.status = 'claimed';
    store.notifications.unshift({ id: randomUUID(), title: 'Recovery marked resolved', message: `A reviewer confirmed the hand-off for “${lost.title}” and “${found.title}”.`, kind: 'recovery', read: false, createdAt: now(), itemId: lost.id });
  }
  await persist();
  res.json({ ok: true, status });
});

app.get('/api/claims', (_req, res) => {
  const claims = [...store.claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((claim) => {
    const item = itemById(claim.itemId);
    return { ...claim, item: publicItem(item) };
  });
  res.json({ claims, count: claims.length });
});

app.post('/api/claims', async (req, res) => {
  const item = itemById(safeText(req.body.itemId, 100));
  if (!item) return notFound(res);
  if (item.type !== 'found') return res.status(400).json({ error: 'Claims can be submitted to found-item reports. For a lost report, create a found report so the Matchmaking Agent can compare them.' });
  if (item.status !== 'open') return res.status(409).json({ error: 'This report is no longer open for claims.' });
  const claimantName = safeText(req.body.claimantName, 100);
  const claimantEmail = safeText(req.body.claimantEmail, 160);
  const verificationAnswer = safeText(req.body.verificationAnswer, 1000);
  if (claimantName.length < 2 || !/^\S+@\S+\.\S+$/.test(claimantEmail) || verificationAnswer.length < 10) {
    return res.status(400).json({ error: 'Add your name, a valid email, and at least 10 characters describing a private identifying detail.' });
  }
  const claim = { id: randomUUID(), itemId: item.id, claimantName, claimantEmail, verificationAnswer, status: 'pending', createdAt: now(), assessment: null };
  try { claim.assessment = await assessClaim(item, claim); }
  catch (error) { claim.assessment = { confidence: 0.5, note: `AI assessment unavailable: ${error.message}. Human review required.`, flags: ['Review required'], source: 'fallback' }; }
  store.claims.unshift(claim);
  store.notifications.unshift({ id: randomUUID(), title: 'New claim requires review', message: `${claimantName} submitted a claim on “${item.title}”. AI advice is triage only; review privately.`, kind: 'claim', read: false, createdAt: now(), itemId: item.id });
  appendAgentRun(store, { agent: 'Claim Safety Agent', summary: `Assessed a new claim on “${item.title}” and left it pending human review.`, source: claim.assessment.source || 'demo', durationMs: 0, metadata: { claimId: claim.id, confidence: claim.assessment.confidence } });
  await persist();
  res.status(201).json({ claim: { ...claim, item: publicItem(item) } });
});

app.patch('/api/claims/:id', async (req, res) => {
  const claim = store.claims.find((entry) => entry.id === req.params.id);
  if (!claim) return notFound(res);
  const status = ['approved', 'rejected'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Choose approved or rejected.' });
  claim.status = status;
  claim.reviewedAt = now();
  const item = itemById(claim.itemId);
  if (status === 'approved' && item) {
    item.status = 'claimed';
    store.notifications.unshift({ id: randomUUID(), title: 'Claim approved', message: `A reviewer approved the claim for “${item.title}”. Coordinate a safe hand-off.`, kind: 'recovery', read: false, createdAt: now(), itemId: item.id });
    store.notifications.unshift({ id: randomUUID(), title: 'Your claim was approved', message: `Your claim for “${item.title}” was approved. Coordinate a safe hand-off with campus staff.`, kind: 'claim', read: false, createdAt: now(), itemId: item.id, audience: claim.claimantEmail });
  } else if (item) {
    store.notifications.unshift({ id: randomUUID(), title: 'Claim decision recorded', message: `A reviewer recorded a decision on a claim for “${item.title}”.`, kind: 'claim', read: false, createdAt: now(), itemId: item.id });
  }
  appendAgentRun(store, { agent: 'Recovery Workflow Agent', summary: `Human reviewer ${status} a claim for “${item?.title || 'an item'}”.`, metadata: { claimId: claim.id, status } });
  await persist();
  res.json({ claim: { ...claim, item: publicItem(item) } });
});

app.get('/api/notifications', (_req, res) => res.json({ notifications: [...store.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
app.post('/api/notifications/:id/read', async (req, res) => {
  const notification = store.notifications.find((entry) => entry.id === req.params.id);
  if (!notification) return notFound(res);
  notification.read = true;
  await persist();
  res.json({ notification });
});

app.get('/api/agents', (_req, res) => {
  const agents = [
    { id: 'visual', name: 'Visual Identification Agent', role: 'Understands uploaded object photos and extracts visible attributes.', icon: 'scan-search', color: 'violet' },
    { id: 'match', name: 'Matchmaking Agent', role: 'Ranks lost/found candidates from visual attributes, language, date and location.', icon: 'git-compare', color: 'blue' },
    { id: 'recovery', name: 'Recovery Workflow Agent', role: 'Coordinates candidate review, notifications and recovery states.', icon: 'workflow', color: 'teal' },
    { id: 'safety', name: 'Claim Safety Agent', role: 'Summarizes claim evidence while keeping a human in control.', icon: 'shield-check', color: 'amber' },
    { id: 'campus', name: 'Campus Intelligence Agent', role: 'Summarizes campus activity and reports location trends.', icon: 'chart-no-axes-combined', color: 'rose' }
  ];
  res.json({ agents, runs: store.agentRuns.slice(0, 80), mode: aiStatus() });
});

app.post('/api/agents/run', async (req, res) => {
  const scope = req.body.scope === 'all' ? 'all' : 'recent';
  const selected = scope === 'all' ? [...store.items] : [...store.items].slice(0, 1);
  for (const item of selected) createAgentPipeline(store, item);
  const matches = findMatches(store.items);
  const byLocation = {};
  for (const item of store.items) byLocation[item.location] = (byLocation[item.location] || 0) + 1;
  const busiest = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
  appendAgentRun(store, { agent: 'Campus Intelligence Agent', summary: `Analysis refreshed across ${store.items.length} reports. ${busiest ? `Most reported location: ${busiest[0]} (${busiest[1]} reports).` : ''}`, metadata: { itemCount: store.items.length, candidateMatches: matches.length } });
  await persist();
  res.json({ ok: true, processed: selected.length, matches: matches.length, mode: aiStatus() });
});

app.post('/api/assistant', async (req, res) => {
  const message = safeText(req.body.message, 1200);
  if (!message) return res.status(400).json({ error: 'Type a question first.' });
  try {
    const matches = findMatches(store.items);
    const reply = await answerCampusQuestion(message, store.items, matches);
    res.json({ ...reply, mode: aiStatus().mode });
  } catch (error) {
    console.error('Assistant error:', error.message);
    res.status(502).json({ error: 'The assistant could not complete that request. Please try again.' });
  }
});

app.get('/api/analytics', (_req, res) => {
  const dashboard = stats();
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.now() - (6 - index) * 86400000);
    const key = day.toISOString().slice(0, 10);
    return { date: key, label: day.toLocaleDateString('en-US', { weekday: 'short' }), lost: 0, found: 0, recovered: 0 };
  });
  for (const item of store.items) {
    const day = recentDays.find((entry) => entry.date === item.itemDate);
    if (day) {
      if (item.type === 'lost') day.lost++;
      if (item.type === 'found') day.found++;
      if (item.status === 'claimed' || item.status === 'closed') day.recovered++;
    }
  }
  res.json({ ...dashboard, recentDays, matchCount: findMatches(store.items).length, claimCount: store.claims.length, runCount: store.agentRuns.length });
});

app.delete('/api/items/:id', async (req, res) => {
  const item = itemById(req.params.id);
  if (!item) return notFound(res);
  store.items = store.items.filter((entry) => entry.id !== item.id);
  store.claims = store.claims.filter((claim) => claim.itemId !== item.id);
  if (item.imageUrl?.startsWith('/uploads/')) {
    const filename = path.basename(item.imageUrl);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  appendAgentRun(store, { agent: 'Recovery Workflow Agent', summary: `Report “${item.title}” was removed by a local demo operator.`, metadata: { itemId: item.id } });
  await persist();
  res.json({ ok: true });
});

// In production, serve the compiled React app from the same Node server.
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Image must be 5 MB or smaller.' });
  if (error) {
    console.error(error.message);
    return res.status(error.statusCode || 400).json({ error: error.message || 'The request could not be processed.' });
  }
  return res.status(500).json({ error: 'Unexpected server error.' });
});

async function startServer() {
  store = await connectStore();
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`CampusConnect AI API is running at http://localhost:${PORT}`);
    console.log('Storage: MongoDB (campusconnect.applicationState)');
    console.log(`AI mode: ${aiStatus().mode}${aiStatus().enabled ? ` (${aiStatus().model})` : ' — set OPENAI_API_KEY to enable live image analysis'}`);
  });

  const shutdown = () => server.close(async () => {
    await closeStore();
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch((error) => {
  console.error('CampusConnect could not start:', error.message);
  process.exitCode = 1;
});
