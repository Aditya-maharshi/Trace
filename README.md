# Trace — On-Chain Wallet Attribution Engine

Trace is an anti-money laundering (AML) intelligence and blockchain attribution platform designed for compliance officers and analysts. Given an Ethereum wallet address, Trace traverses the transaction graph using breadth-first search (BFS) heuristics to attribute fund flows to known Virtual Asset Service Providers (VASPs), exchanges, bridges, and mixers, generating explainable multi-hop path visualizations, confidence scores, and AI-narrated compliance reports.

## Project Structure

This monorepo contains two primary applications:

- **`apps/api`**: Next.js backend providing REST and SSE endpoints for BFS graph traversal, live Etherscan and Blockscout ingestion, sanctions screening (OpenSanctions), rate limiting, and Gemini/Groq streaming AI trace narration.
- **`apps/web`**: Modern Vite + React frontend dashboard featuring interactive canvas graph visualizations, live BFS streaming progress feeds, audit history, and real-time chat with trace evidence citations.
- **`packages/shared-types`**: Shared TypeScript definitions and data interfaces common to both frontend and backend.

## Local Setup & Installation

### Prerequisites
- Node.js 18+ or 20+
- npm (or bun / pnpm)

### 1. Install Dependencies
Run from the root of the repository:
```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` inside `apps/api`:
```bash
cp apps/api/.env.local.example apps/api/.env.local
```
*(Fill in your API keys for Etherscan, Gemini/Groq, Supabase, etc.)*

Create `.env.local` inside `apps/web`:
```bash
cp apps/web/.env.example apps/web/.env.local
```
*(Configure `VITE_API_URL=http://localhost:3000` and your Supabase public credentials)*

### 3. Running Locally

**Terminal 1 — Backend API:**
```bash
cd apps/api
npm run dev
```
Backend API will start at `http://localhost:3000`.

**Terminal 2 — Web Frontend:**
```bash
cd apps/web
npm run dev
```
Web frontend will start at `http://localhost:8080` (or `http://localhost:8083`).
