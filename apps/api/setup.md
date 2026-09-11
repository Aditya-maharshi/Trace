# VASP Attribution Backend Setup Checklist
**Status: Pre-deployment (Phases 1-6 vibe-coded, now setting up infrastructure)**

---

## ⚠️ BLOCKER CHECKLIST — Do these FIRST (30 min)
All teams members need these before ANY code runs.

### 1. GitHub Repository Setup
- [ ] **Create GitHub repo** (e.g., `vasp-attribution`)
  - Go to github.com → New Repository
  - Name: `vasp-attribution`
  - Make it Private (if you prefer) or Public
  - Add `.gitignore` for Node.js (GitHub's template is fine)
  - Create repo
  
- [ ] **Clone locally** — Both Person A and Person B:
  ```bash
  git clone https://github.com/YOUR_USERNAME/vasp-attribution.git
  cd vasp-attribution
  ```

- [ ] **Agree on branch strategy** (add this to your README):
  ```
  main → protected, only merge via PR
  feature/backend-a → Person A (Phases 1-3)
  feature/backend-b → Person B (Phases 4-6)
  feature/level-1-* → Level 1 features (7A-7E) if time permits
  ```

- [ ] **Create and commit initial files**:
  ```bash
  touch .env.local.example
  mkdir -p data/cache
  mkdir -p lib
  mkdir -p app/api
  git add .
  git commit -m "Initial commit: project structure"
  ```

---

### 2. Create All API Keys (30 min total, do this NOW)

| Service | Purpose | Link | What You'll Get | Notes |
|---------|---------|------|-----------------|-------|
| **Etherscan** | ETH tx data | [etherscan.io/apis](https://etherscan.io/apis) | API Key | Free: 5 calls/sec, 100k/day |
| **BscScan** | BSC tx data | [bscscan.com/apis](https://bscscan.com/apis) | API Key | Same limits as Etherscan |
| **PolygonScan** | Polygon tx data | [polygonscan.com/apis](https://polygonscan.com/apis) | API Key | Same limits |
| **Supabase** | Postgres DB + Auth | [supabase.com](https://supabase.com) → New Project | Project URL + Anon Key | Free tier: 500 MB DB, good enough for hackathon |
| **Anthropic** | AI narrative layer (Phase 6) | [console.anthropic.com](https://console.anthropic.com) → API Keys | API Key | Free tier: sign up, get key |
| **OpenSanctions** | Sanctions screening | [api.opensanctions.org](https://api.opensanctions.org) | No key needed | Free tier works without auth; check docs day-of |

#### Step-by-step for each:

**Etherscan, BscScan, PolygonScan** (same pattern):
1. Sign up
2. Go to API Keys section
3. Create New API Key
4. Name it (e.g., "vasp-attribution-hackathon")
5. Copy the key → paste into your `.env.local` file (see Section 3 below)

**Supabase**:
1. Sign up with GitHub
2. Create New Project
3. Go to Settings → API
4. Copy `Project URL` and `anon public` key
5. Paste both into `.env.local`

**Anthropic**:
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Click API Keys
3. Create New Key
4. Copy → paste into `.env.local`

**OpenSanctions**:
- No setup needed for basic searches. Confirm free tier works: `curl 'https://api.opensanctions.org/search/default?q=binance'`

---

### 3. Environment Variables Setup
Create `.env.local.example` (COMMITTED to repo):
```
# Etherscan API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Supabase
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Anthropic (for Phase 6 AI narrative)
GEMINI_API_KEY=your_gemini_api_key_here


**Each team member** creates their own `.env.local` (GITIGNORED):
```bash
cp .env.local.example .env.local
# Then fill in YOUR actual keys in .env.local
# NEVER commit .env.local
```

Verify `.gitignore` includes:
```
.env.local
.env*.local
```

---

### 4. Vercel Deployment (5 min setup, do this NOW to avoid surprises Day 2)
- [ ] Go to [vercel.com](https://vercel.com)
- [ ] Sign in with GitHub
- [ ] Import your `vasp-attribution` repo
- [ ] Click "Deploy"
- [ ] **Add Environment Variables** in Vercel dashboard:
  - Add each key from `.env.local.example`
  - Paste the actual values
  - ⚠️ **NEVER** commit `.env.local` to the repo — Vercel reads them from the dashboard only

- [ ] Note your Vercel URL (e.g., `https://vasp-attribution.vercel.app`)
- [ ] Verify deployment succeeds (it may fail now because the app isn't built yet, that's OK)

---

## ✅ PRE-BUILD CHECKLIST — Before First `npm run build`

### Project Structure
```
vasp-attribution/
├── .env.local.example         ✅ Created & committed
├── .env.local                 ✅ Created locally (NOT committed)
├── package.json               ✅ Next.js 14 App Router
├── tsconfig.json              ✅ Full TypeScript
├── data/
│   └── cache/                 ✅ Created (will hold cached JSON)
├── lib/
│   ├── types.ts               ✅ Shared Tx, PathResult, etc. (Person A + B agree FIRST)
│   ├── etherscan.ts           ✅ Person A — Phase 1
│   ├── vaspLabels.ts          ✅ Person A — Phase 1
│   ├── graphBuilder.ts        ✅ Person A — Phase 2
│   ├── attribution.ts         ✅ Person A — Phase 3
│   ├── sanctions.ts           ✅ Person B — Phase 4
│   ├── clustering.ts          ✅ Person B — Phase 5
│   ├── ens.ts                 ✅ Phase 7D (if time)
│   ├── structuring.ts         ✅ Phase 7C (if time)
│   └── bridgeDetection.ts     ✅ Phase 7E (if time)
├── app/
│   ├── api/
│   │   ├── attribute/
│   │   │   └── route.ts       ✅ Person A → Phase 3 (updated with sanctions in merge)
│   │   ├── narrate/
│   │   │   └── route.ts       ✅ Person B → Phase 6
│   │   ├── attribute-stream/
│   │   │   └── route.ts       ✅ Phase 7A (SSE streaming, if time)
│   │   ├── chat/
│   │   │   └── route.ts       ✅ Phase 7B (AI follow-up, if time)
│   │   └── ...
│   ├── layout.tsx
│   └── page.tsx               ← Frontend (do NOT build yet)
├── .gitignore                 ✅ Includes .env.local
└── README.md                  ✅ Branch strategy documented
```

---

## 🔄 WORKFLOW FOR DAYS 1-2

### Day 1 — Build & Merge (Parallel)

**Person A** (Branch: `feature/backend-a`):
1. `git checkout -b feature/backend-a`
2. Implement `lib/types.ts` first (CRITICAL: agree with Person B on Tx, PathResult shapes)
3. Implement Phase 1: `lib/etherscan.ts` + `lib/vaspLabels.ts`
4. Implement Phase 2: `lib/graphBuilder.ts`
5. Implement Phase 3: `lib/attribution.ts` + `app/api/attribute/route.ts` (with hardcoded `risk: "LOW"` for now)
6. Run `npm run build` — must pass
7. Test locally: `npm run dev` → call `http://localhost:3000/api/attribute?address=0x1234...`
8. Commit and push to `feature/backend-a`
9. **DO NOT merge to main yet** — wait for Person B

**Person B** (Branch: `feature/backend-b`):
1. `git checkout -b feature/backend-b`
2. Pull the latest `lib/types.ts` from Person A (ask for it)
3. Implement Phase 4: `lib/sanctions.ts`
4. Implement Phase 5: `lib/clustering.ts`
5. Implement Phase 6: `app/api/narrate/route.ts`
6. Run `npm run build` — must pass
7. Test locally: `npm run dev` → call narrate endpoint with a sample attribution result
8. Commit and push to `feature/backend-b`
9. **DO NOT merge to main yet** — wait for Person A

### Day 1 Evening / Day 2 Morning — Merge & Integrate

**On "the merge machine"** (one PC):
1. `git checkout feature/backend-a`
2. `git merge feature/backend-b`
3. Resolve merge conflicts (most likely: `lib/types.ts` or imports)
4. Update `app/api/attribute/route.ts`:
   - Import `checkSanctioned` and `riskFlagPath` from `lib/sanctions.ts`
   - Replace `risk: "LOW"` with actual call:
     ```typescript
     const sanctionCheck = await riskFlagPath(winningPath.path);
     const risk = sanctionCheck.some(addr => addr.sanctioned) ? "HIGH" : "LOW";
     ```
5. Run `npm run build` — fix TypeScript errors
6. Smoke test:
   ```bash
   npm run dev
   # In another terminal:
   curl 'http://localhost:3000/api/attribute?address=0x...'
   # Should return valid JSON with all fields
   ```
7. Commit: `git commit -m "merge: unified backend attribution + compliance + clustering"`
8. `git push origin feature/backend-a`
9. Create Pull Request: `feature/backend-a` → `main`
10. **Merge to main once CI passes** (if you have CI setup) or manually

---

## 🚀 TESTING CHECKLIST (Before moving to frontend)

### Unit Tests (minimal, but do these)
- [ ] `lib/etherscan.ts::getTransactions()` returns normalized Tx[] (not raw API shape)
- [ ] `lib/graphBuilder.ts::findNearestVASP()` finds shortest path and stops at VASP
- [ ] `lib/attribution.ts::scorePath()` scoring formula matches spec (check math)
- [ ] `lib/sanctions.ts::checkSanctioned()` returns boolean correctly
- [ ] `lib/clustering.ts::detectDepositFunnel()` identifies funnels from tx array

### Integration Tests (smoke tests on live APIs)
- [ ] Pick a known wallet (e.g., Binance hot wallet from Etherscan labels)
- [ ] Call `/api/attribute?address=0xbinance...`
- [ ] Verify response has all fields:
  ```json
  {
    "wallet": "0x...",
    "nearestVasp": "Binance",
    "hops": <number>,
    "confidence": "High|Medium|Low",
    "score": <number>,
    "paths": [<PathResult[]>],
    "risk": "HIGH|LOW"
  }
  ```
- [ ] Call `/api/narrate` with that result
- [ ] Verify narrative is 2-3 sentences, plain English

### Rate-Limit / Error Handling
- [ ] Rapid-fire 10 requests to `/api/attribute` → should not hit Etherscan limits (250ms delays respected)
- [ ] Typo a wallet address → should return 400 with clear error message
- [ ] Kill internet, call API → should return 500 with "Network error" (not crash)

---

## 📋 REMAINING SETUP TASKS (Prioritized)

### 🔴 CRITICAL (Must do before Day 2 demo)
- [ ] All 6 API keys created and in `.env.local`
- [ ] GitHub repo cloned, both team members have local copies
- [ ] `.env.local.example` committed, `.env.local` gitignored
- [ ] Vercel deployment connected (don't worry if build fails now)
- [ ] `lib/types.ts` written and agreed upon by both Persons A & B
- [ ] Phases 1-6 implemented (Person A finishes Phase 3 first, Person B can start Phase 4 immediately)
- [ ] Main merge completed without conflicts
- [ ] `npm run build` passes on main branch
- [ ] Smoke tests pass on `/api/attribute` and `/api/narrate`

### 🟡 HIGH PRIORITY (Do Day 2 morning if time)
- [ ] Phase 7A: SSE streaming (`app/api/attribute-stream/route.ts`)
- [ ] Phase 7D: ENS resolution (`lib/ens.ts` + wire into response)
- [ ] Phase 7C: Structuring detection (`lib/structuring.ts` + wire into response)

### 🟢 NICE-TO-HAVE (Only if everything else is rock-solid)
- [ ] Phase 7B: AI chat follow-up (`app/api/chat/route.ts`)
- [ ] Phase 7E: Cross-chain bridge trace (only if Day 2 midday and stable)

---

## 🆘 COMMON BLOCKERS & FIXES

| Problem | Cause | Fix |
|---------|-------|-----|
| `npm run build` fails with "ETHERSCAN_API_KEY undefined" | `.env.local` not loaded | Ensure `.env.local` exists locally (not committed), contains real values |
| Rate limit errors from Etherscan | 250ms delay not implemented | Check Phase 1 prompt — delay must be between EACH of the 3 API calls, not just one |
| Merge conflicts in `lib/types.ts` | Person A & B edited types differently | Resolve by viewing both versions, merge types into one canonical file, both re-pull |
| Vercel deploy fails with "Module not found" | Package not installed | Run `npm install` locally, check `package.json`, push to GitHub |
| `/api/attribute` returns `null` or `undefined` fields | Missing imports or incomplete implementation | Run `npm run build` locally to catch all TS errors first |
| "getTransactions is not cached, too many API calls" | Cache folder not created or permissions issue | Ensure `data/cache/` directory exists and is writable: `mkdir -p data/cache` |

