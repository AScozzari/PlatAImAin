# PlatAImAin — Context

## Percorsi

| Ambiente | Percorso |
|---|---|
| Container (Linux) | `/home/user/PlatAImAin` |
| Windows locale | `C:\Users\a.scozzari\Desktop\MvPplatAI` |

## Repository GitHub
- Repo: `https://github.com/AScozzari/PlatAImAin.git`
- Branch attivo: `claude/link-local-folder-w08Xi`

## Stack
- **Gateway**: Python 3.11 + FastAPI (`gateway/`)
- **Dashboard**: React 18 + Vite + shadcn/ui + Tailwind (`dashboard/`)
- **DB**: PostgreSQL (asyncpg)
- **Cache / Quota**: Redis (Lua atomic)
- **Modelli Tipo A**: vLLM proxy (LLM, Reasoning, Coding, Vision, Embedding)
- **Modelli Tipo B**: embedded Python (faster-whisper STT, XTTS V2 / Kokoro / StyleTTS2 TTS)

## Avvio dashboard locale (Windows)
```powershell
cd C:\Users\a.scozzari\Desktop\MvPplatAI\dashboard
npm install   # solo prima volta
npm run dev
# apri http://localhost:3000
```

## Note importanti
- Cartella locale Windows: `C:\Users\a.scozzari\Desktop\MvPplatAI` (NON PlatAImAin)
- Dev server porta: **3000** (configurata in vite.config.ts)
- In modalità DEV il login accetta qualsiasi credenziale (bypass fake token)
- Per sincronizzare modifiche dal container al Windows: `git pull` nella cartella locale
