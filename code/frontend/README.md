# Quick Start Guide - Orbis Frontend

### 1. Install Dependencies
```bash
cd code/frontend
npm install
```

### 2. Configure Environment
Already configured! `.env` file is set to:
```
VITE_API_URL=http://localhost:5000
```

### 3. Start Development Server
```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## What You'll See

### Without Backend Running
- Home page works (static content)
- Login page renders
- Sign in/up will fail (no backend)
- Map and Places pages require auth

### With Backend Running
1. **Sign up** - Create account
2. **Sign in** - Get JWT token
3. **Map View** - Add locations by clicking
4. **Places** - Browse and search
5. **Route Planning** - Compute paths

---

## Scripts

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

---

## Project Structure

```
src/
├── pages/          # All page components
├── services/       # API communication
├── types/          # TypeScript models
├── utils/          # Helper functions
├── App.tsx         # Main app
├── main.tsx        # Entry point
└── index.css       # Global styles
```

---

**Team T03-7** - CPSC 471 Fall 2025


Dev server will run on http://localhost:3000 and proxy `/api` to `http://localhost:5000` by default.

Environment variables:
- Copy `.env.example` to `.env` and edit `VITE_API_URL`.
