# Pidgyn

**Date anyone. Speak any language. Your voice, their language.**

Pidgyn is a dating app where language barriers don't exist. Record a voice bio, browse profiles from around the world, and hear everyone in your native language — using a clone of their actual voice.

**Live:** https://app.pidgyn.workers.dev

## How It Works

1. **Record** — Record a voice bio. Pidgyn clones your voice instantly using ElevenLabs.
2. **Browse** — See profiles worldwide. Voice bios are transcribed and displayed regardless of language.
3. **Connect** — Tap "Hear in [your language]" to hear their bio translated and spoken in their cloned voice. Match, then chat with real-time message translation.

## Tech Stack

Built entirely on the edge for near-zero latency worldwide.

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| State | Cloudflare Durable Objects (UserDirectory, ChatRoom) |
| Speech-to-Text | Cloudflare Workers AI (`@cf/openai/whisper`) |
| Translation | Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) |
| Voice Cloning | ElevenLabs Instant Voice Cloning API |
| Text-to-Speech | ElevenLabs Flash v2.5 |
| Frontend | Single-file HTML served via Cloudflare Pages |

## Features

- **Instant Voice Cloning** — Browser records WebM, converts to WAV client-side, clones via ElevenLabs IVC. Your voice bio sounds like you in any language.
- **Cross-Lingual Profiles** — Browse profiles in any of 15 supported languages. Voice bios transcribed via Whisper, translated via Llama 3.1 8b.
- **Real-Time Chat Translation** — WebSocket-based messaging through Durable Objects. Messages translate automatically between matched users.
- **Voice Messages** — Record and send voice messages in chat. Whisper transcribes, Llama translates, ElevenLabs speaks the translation in the sender's cloned voice.
- **Smart Discovery** — Profiles sorted by language diversity first, voice bio presence second, with random shuffle within tiers. Matched profiles move to the Matches tab.

## Project Structure

```
pidgyn/
  src/
    index.ts            — Worker entry, API routes, STT, TTS diagnostic
    user-directory.ts   — UserDirectory DO: profiles, browsing, matching
    chat-room.ts        — ChatRoom DO: WebSocket chat, translation, voice
    translation.ts      — Workers AI translation (Llama primary, m2m100 fallback)
    elevenlabs.ts       — ElevenLabs TTS + voice clone helpers
  public/
    index.html          — Complete frontend (landing, signup, browse, match, chat)
    mic.png             — Step icon: microphone
    globe.png           — Step icon: globe
    message.png         — Step icon: speech bubbles
  wrangler.jsonc        — Cloudflare config
```

## Local Development

```bash
npm install

# Create .dev.vars with your ElevenLabs key
echo 'ELEVENLABS_API_KEY="your_key_here"' > .dev.vars

npm run dev
# Open http://localhost:8787
```

## Deploy

```bash
npx wrangler secret put ELEVENLABS_API_KEY
npm run deploy
```

## Supported Languages

English, Spanish, Japanese, Korean, French, Portuguese, Chinese, German, Arabic, Hindi, Italian, Russian, Thai, Vietnamese, Filipino

## Built for ElevenHacks #2 (Cloudflare)

Pidgyn was built in 48 hours for the ElevenLabs x Cloudflare hackathon.

The thesis: dating apps connect people who already share a language. What if the app itself could be the translator — not with robotic text, but with your actual voice speaking their language?

#ElevenHacks @CloudflareDev @elevenlabsio
