# Frontend (Vite + React + TypeScript)

This folder contains the frontend scaffold for the CPSC 471 final project. It's intentionally minimal and includes Tailwind CSS configuration.

Run locally:

```bash
cd code/frontend
npm install
npm run dev
```

Dev server will run on http://localhost:3000 and proxy `/api` to `http://localhost:5000` by default.

Environment variables:
- Copy `.env.example` to `.env` and edit `VITE_API_URL`.
