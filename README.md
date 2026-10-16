# CampusConnect AI

**A multimodal, agentic lost-and-found recovery system for campus communities.** This project is a standalone React + JavaScript frontend with a Node.js/Express backend. It is not connected to Lovable and does not need a Lovable account.

## What is included

- **Campus dashboard** with item totals, possible matches, recent reports and agent activity.
- **Lost/found reporting** with photo uploads, image previews, category/location/date information and an AI-assisted report form.
- **Visual Identification Agent** that uses a configured vision model to propose an object title, category, color, visible features and keywords.
- **Matchmaking Agent** that ranks opposite-type reports using model-extracted attributes, description overlap, category, date proximity and location. Each candidate includes reasons and a score breakdown.
- **Recovery Workflow Agent** that records workflow events and creates in-app suggestions when candidates cross the configured threshold.
- **Claim Safety Agent** that produces a claim triage note and evidence signal. It never auto-approves a claim.
- **Campus Intelligence Agent** that summarizes report locations and categories.
- **Claim review queue**, manual match review states, notifications, campus analytics, execution history and a data-grounded assistant panel.
- **MongoDB persistence** in the `campusconnect` database; uploaded photographs are stored in `server/uploads/`. Existing JSON data is imported automatically when the database is empty. Example records appear automatically on first run.
- **Demo mode** works without an AI key, using seed data and transparent rule-based analysis/matching. Live image understanding and natural-language assistant responses are enabled when an OpenAI API key is configured.

## Requirements

- Node.js 20 or later (Node 22 recommended)
- npm
- MongoDB Community Server running locally, or a MongoDB Atlas connection URI
- MongoDB Compass (optional; use it to view the database)
- Internet access when first installing dependencies
- Optional: an OpenAI API key for live image analysis and model-backed assistant/claim triage

## Run locally

1. Extract the ZIP and open the `campusconnect-ai` folder in VS Code.
2. Open a terminal at the project root.
3. Install packages:

   ```bash
   npm install
   ```

4. Optional but recommended for live model-powered image analysis: copy `.env.example` to `.env` and add your API key:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `OPENAI_API_KEY`. Keep this key server-side and never commit the real `.env` file. The default vision model can be changed with `OPENAI_VISION_MODEL`.

5. Make sure MongoDB is running. The default connection is `mongodb://127.0.0.1:27017/campusconnect`. To use another local instance or Atlas, set `MONGODB_URI` in `.env`; optionally set `MONGODB_DB_NAME` to select the database. Keep database credentials private.

   On startup, CampusConnect imports the existing `server/data/store.json` data if MongoDB has not been initialized yet. New changes are written to MongoDB before the API reports success.

6. Start the frontend and backend together:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:5173` in your browser. The API runs at `http://localhost:3001`.

In MongoDB Compass, connect to the same URI and open the `campusconnect` database and `applicationState` collection. The collection holds the app state in a document with `_id: "campusconnect"`.

The app binds to localhost for development. Use synthetic details when testing.

## Production build (local preview)

```bash
npm run build
npm start
```

Then visit `http://localhost:3001`.

## How the agents work

The backend orchestrates named specialist steps whenever a new report is submitted or the workflow is re-run:

1. **Visual Identification** calls the configured vision model on the uploaded photo. With no key, it explicitly marks output as demo heuristics rather than claiming a real visual recognition result.
2. **Matchmaking** compares the extracted visual description/attributes and report fields with opposite-type records and sorts candidate pairs.
3. **Recovery Workflow** records candidates, prepares in-app notifications for high-scoring candidates, and tracks human review status.
4. **Claim Safety** compares a claimant's private answer with the description/attributes and provides a triage summary. A human reviewer must approve or reject a claim.
5. **Campus Intelligence** summarizes report counts by location/category.

The initial matcher uses text/attribute similarity plus category, date and location signals. It does **not** currently store raw image embeddings or use a vector database. That can be a follow-on enhancement if you want to add pgvector or another multimodal embedding service.

## Data and security notes

This is a **working local prototype**, not a production-ready campus service. It uses MongoDB for application state and local disk for uploaded files; it has no real authentication/authorization layer. All claim review screens are demo operator screens; the backend endpoints must be protected before publishing this to a public server. Do not enter real student IDs, phone numbers, sensitive documents, passwords or other private information into the demo. Before deployment, add authenticated accounts, role-based access control, private image storage/signed URLs, row-level authorization, rate limiting, retention policies and audit controls. Never publish the `.env` file or commit an API key or database credentials.

The model is instructed not to transcribe personal information from ID/document photos, but this instruction is not a substitute for access controls and safe data handling.

## Project structure

```text
campusconnect-ai/
├── client/
│   ├── public/demo/       # Local illustrative item images
│   └── src/
│       ├── App.jsx        # React app and views
│       ├── api.js         # API helper and formatting utilities
│       ├── main.jsx       # React entry point
│       └── styles.css     # Responsive UI system
├── server/
│   ├── agents.js          # Specialist analysis, ranking and agent logs
│   ├── index.js           # Express API routes and file uploads
│   ├── store.js           # Local JSON persistence and example data
│   ├── data/              # Created at runtime
│   └── uploads/           # Uploaded images, created at runtime
├── .env.example
├── package.json
└── README.md
```

## Suggested final-project evaluation

Build a small test set with known lost/found pairs and unrelated reports. Measure top-1 match accuracy, Recall@5, false-match rate, median workflow runtime, and human-confirmed recovery rate. Label the current scores as candidate-ranking scores—not calibrated probabilities. Compare the matcher with a keyword-only baseline and report both correct matches and false positives.
