import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, 'data');
export const UPLOAD_DIR = path.join(__dirname, 'uploads');
export const STORE_PATH = path.join(DATA_DIR, 'store.json');

let mongoClient;
let storeCollection;
let saveQueue = Promise.resolve();
const STORE_DOCUMENT_ID = 'campusconnect';

const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
const dateAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

export function createSeedStore() {
  const items = [
    {
      id: 'demo-item-1', type: 'lost', title: 'Black wireless earbuds case', category: 'Electronics',
      description: 'Small matte black oval charging case for wireless earbuds. Tiny green indicator on the front. Might have slipped from my pocket.',
      location: 'Central Library · 2nd floor', itemDate: dateAgo(1), contactInfo: '',
      imageUrl: '/demo/earbuds.svg', status: 'open', createdAt: ago(1, 2), ownerName: 'Aarav Menon', ownerEmail: 'aarav.demo@campus.edu',
      aiAttributes: { object: 'wireless earbuds charging case', color: 'black', visibleFeatures: ['oval case', 'small front indicator', 'matte finish'], visualSummary: 'A small matte black oval wireless earbuds charging case with a tiny front indicator.', keywords: ['earbuds', 'charging case', 'black', 'oval'], confidence: 0.92, source: 'demo' }
    },
    {
      id: 'demo-item-2', type: 'found', title: 'Black earbuds case found', category: 'Electronics',
      description: 'Found a dark oval earbud case on a desk near the reading area. No name visible. Handed in for owner verification.',
      location: 'Central Library · Reading area', itemDate: dateAgo(1), contactInfo: '',
      imageUrl: '/demo/earbuds.svg', status: 'open', createdAt: ago(1, 1), ownerName: 'Mira Shah', ownerEmail: 'mira.demo@campus.edu',
      aiAttributes: { object: 'earbuds charging case', color: 'black', visibleFeatures: ['oval case', 'front status light', 'compact'], visualSummary: 'A compact dark black oval wireless earbud case with a small status light.', keywords: ['earbud case', 'black', 'oval', 'charging'], confidence: 0.89, source: 'demo' }
    },

  ];

  return {
    items,
    claims: [
      { id: 'demo-claim-1', itemId: 'demo-item-2', claimantName: 'Aarav Menon', claimantEmail: 'aarav.demo@campus.edu', verificationAnswer: 'It has a small green indicator light.', status: 'pending', createdAt: ago(0, 5), assessment: { confidence: 0.74, note: 'Potential match; ask owner to confirm a private detail.', source: 'demo' } },
      { id: 'demo-claim-2', itemId: 'demo-item-4', claimantName: 'Nisha Varma', claimantEmail: 'nisha.demo@campus.edu', verificationAnswer: 'Mine has a scratch near the lower edge.', status: 'pending', createdAt: ago(0, 3), assessment: { confidence: 0.8, note: 'Description contains a distinguishing feature; human confirmation required.', source: 'demo' } }
    ],
    matchReviews: [],
    notifications: [
      { id: 'demo-notif-1', title: 'Strong possible match', message: 'Your black earbuds report has a promising match near the library.', kind: 'match', read: false, createdAt: ago(0, 4), itemId: 'demo-item-1' },
      { id: 'demo-notif-2', title: 'New claim needs review', message: 'A student submitted a claim on Black earbuds case found.', kind: 'claim', read: false, createdAt: ago(0, 3), itemId: 'demo-item-2' },
      { id: 'demo-notif-3', title: 'Campus recovery pulse', message: 'Four report pairs are worth reviewing today.', kind: 'agent', read: true, createdAt: ago(0, 1), itemId: null }
    ],
    agentRuns: [
      { id: 'run-demo-1', agent: 'Visual Identification Agent', status: 'completed', summary: 'Identified an earbuds charging case and extracted 4 visible attributes.', source: 'demo', createdAt: ago(0, 5), durationMs: 620 },
      { id: 'run-demo-2', agent: 'Matchmaking Agent', status: 'completed', summary: 'Ranked 5 opposite-type reports; 2 candidates exceeded the review threshold.', source: 'demo', createdAt: ago(0, 5), durationMs: 340 },
      { id: 'run-demo-3', agent: 'Recovery Workflow Agent', status: 'completed', summary: 'Prepared student notification and kept the hand-off pending human review.', source: 'demo', createdAt: ago(0, 4), durationMs: 210 },
      { id: 'run-demo-4', agent: 'Claim Safety Agent', status: 'completed', summary: 'Flagged a claim for owner verification. No claim was auto-approved.', source: 'demo', createdAt: ago(0, 3), durationMs: 180 },
      { id: 'run-demo-5', agent: 'Campus Intelligence Agent', status: 'completed', summary: 'Library and student centre are the most active areas in the sample data.', source: 'demo', createdAt: ago(0, 1), durationMs: 270 }
    ]
  };
}

export function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function normalizeStore(parsed) {
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    claims: Array.isArray(parsed.claims) ? parsed.claims : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    matchReviews: Array.isArray(parsed.matchReviews) ? parsed.matchReviews : [],
    agentRuns: Array.isArray(parsed.agentRuns) ? parsed.agentRuns : []
  };
}

export function loadStore() {
  ensureDirectories();
  if (!fs.existsSync(STORE_PATH)) {
    return createSeedStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return normalizeStore(parsed);
  } catch (error) {
    console.error('The local data file could not be read. Starting with sample data.', error.message);
    return createSeedStore();
  }
}

export async function connectStore() {
  ensureDirectories();
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusconnect';
  mongoClient = new MongoClient(uri);
  try {
    await mongoClient.connect();
    const database = mongoClient.db(process.env.MONGODB_DB_NAME || 'campusconnect');
    storeCollection = database.collection('applicationState');
    const existing = await storeCollection.findOne({ _id: STORE_DOCUMENT_ID });
    if (existing) return normalizeStore(existing);

    const initial = loadStore();
    await saveStore(initial);
    console.log('Initialized MongoDB from the local store or demo seed data.');
    return initial;
  } catch (error) {
    await mongoClient.close();
    mongoClient = null;
    storeCollection = null;
    throw error;
  }
}

export function saveStore(store) {
  if (!storeCollection) throw new Error('MongoDB storage is not connected.');
  const snapshot = structuredClone(normalizeStore(store));
  const save = saveQueue.then(() => storeCollection.replaceOne(
    { _id: STORE_DOCUMENT_ID },
    { _id: STORE_DOCUMENT_ID, ...snapshot },
    { upsert: true }
  ));
  saveQueue = save.catch(() => {});
  return save;
}

export async function closeStore() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    storeCollection = null;
  }
}
