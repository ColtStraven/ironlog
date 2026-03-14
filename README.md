# IronLog

A personal fitness analytics desktop app. Local, private, no subscriptions, no cloud.

Built with Electron and sql.js — your data lives entirely on your own machine.

---

## What it does

IronLog is a workout tracker built around analytics rather than logging. After each session you get a full coaching-style breakdown — not just what you lifted, but what it means.

**Session Analysis**
Post-workout narrative covering strength-endurance ratio, session volume vs growth zones, rep range distribution across hypertrophy zones, and a 12-week recomp projection based on your actual data.

**Strength Trends**
Epley-estimated 1RM graphed over time per exercise. Progressive overload tracker with plateau detection, weekly gain rate, and double progression guidance.

**Recomp Tracker**
Overlays bodyweight, waist measurements, and weekly training volume on one chart. Computes a recomp signal score from your trends.

**Deload Detector**
Watches four fatigue signals session-to-session — volume drift, drop-off creep, strength drift, and session spacing — and flags when a deload is due before performance crashes.

**Full logging suite**
Workout logger with live drop-off feedback, session history, exercise management, body measurements, daily step count, and nutrition log.

---

## Screenshots

<!-- Add screenshots here once the app is running -->
<!-- Suggested: dashboard, session analysis, strength trends, deload detector -->

---

## Installation

**Prerequisites**
- [Node.js](https://nodejs.org/) v18 or higher
- Windows, macOS, or Linux

**Steps**

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/ironlog.git
cd ironlog

# 2. Install dependencies
npm install

# 3. Run
npm start
```

> **Windows note:** IronLog uses `sql.js` (WebAssembly SQLite) specifically to avoid native compilation issues on Windows. No Visual Studio or build tools are required.

**Dev mode** (opens DevTools automatically)

```bash
npm run dev
```

---

## Data storage

Your database is stored locally at:

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\IronLog\ironlog.db` |
| macOS    | `~/Library/Application Support/IronLog/ironlog.db` |
| Linux    | `~/.config/IronLog/ironlog.db` |

No data ever leaves your machine. There is no server, no account, no telemetry.

---

## Project structure

```
ironlog/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process
│   │   ├── preload.js       # Context bridge — IPC surface exposed to renderer
│   │   └── database.js      # sql.js schema, IPC handlers, stat engine
│   └── renderer/
│       ├── index.html       # App shell and navigation
│       ├── css/
│       │   └── main.css     # Global styles — clinical light theme
│       └── pages/
│           ├── router.js        # Single-page navigation
│           ├── app.js           # Bootstrap
│           ├── dashboard.js     # Dashboard + live charts
│           ├── log.js           # Workout logger
│           ├── analysis.js      # Session analysis narrative
│           ├── strength.js      # 1RM trends + progressive overload
│           ├── recomp.js        # Recomp tracker
│           ├── deload.js        # Deload detector
│           ├── history.js       # Session history
│           ├── exercises.js     # Exercise management
│           └── measurements.js  # Body metrics, activity, nutrition
├── .gitignore
├── LICENSE
├── README.md
└── package.json
```

---

## Analytics engine

All calculations run locally in `src/main/database.js`.

| Metric | Formula |
|--------|---------|
| Session volume | `SUM(reps × weight_lbs)` |
| Strength-endurance drop-off | `(first_set_reps − last_set_reps) / first_set_reps × 100` |
| Estimated 1RM | Epley: `weight × (1 + reps / 30)` |
| Rep zones | Strength 1–6 / Size 7–12 / Metabolic 13+ |
| Volume zones | Maintenance &lt;5k / Slow 5k–7k / Ideal 7k–12k / Risk &gt;15k lbs |
| Fatigue score | 4 signals × 25 pts: volume drift + drop-off creep + strength drift + session spacing |
| Recomp score | Weight slope + waist slope + volume slope, 0–100 |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Electron](https://www.electronjs.org/) 29 |
| Database | [sql.js](https://sql.js.org/) 1.12 (SQLite via WebAssembly) |
| Charts | [Chart.js](https://www.chartjs.org/) 4.4 |
| Fonts | DM Sans + DM Mono (Google Fonts) |
| Styling | Vanilla CSS — no framework |
| JS | Vanilla ES6 — no build step, no bundler |

---

## Contributing

This is a personal project built for real-world use. Issues and pull requests are welcome.

If you fork it and build something different — share it.

---

## License

MIT — see [LICENSE](./LICENSE).
