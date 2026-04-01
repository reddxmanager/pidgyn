// Pidgyn — Worker Entry Point

export { UserDirectory } from "./user-directory";
export { ChatRoom } from "./chat-room";

interface Env {
  AI: Ai;
  ELEVENLABS_API_KEY: string;
  USER_DIRECTORY: DurableObjectNamespace;
  CHAT_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- USER DIRECTORY ROUTES ---
    // All user/profile/matching operations go through a single global UserDirectory DO

    if (url.pathname.startsWith("/api/user/")) {
      const doId = env.USER_DIRECTORY.idFromName("global");
      const stub = env.USER_DIRECTORY.get(doId);

      // Map routes to internal DO paths
      const route = url.pathname.replace("/api/user", "");
      const doUrl = new URL(request.url);
      doUrl.pathname = route;
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // --- ADMIN: RESET ALL PROFILES ---
    if (url.pathname === "/api/admin/reset" && request.method === "POST") {
      const doId = env.USER_DIRECTORY.idFromName("global");
      const stub = env.USER_DIRECTORY.get(doId);
      const doUrl = new URL(request.url);
      doUrl.pathname = "/reset";
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // --- TTS DIAGNOSTIC ---
    // Hit /api/tts-test to verify the ElevenLabs API key + TTS pipeline

    if (url.pathname === "/api/tts-test" && request.method === "GET") {
      const { textToSpeech, getVoiceForGender } = await import("./elevenlabs");
      const keyPrefix = env.ELEVENLABS_API_KEY ? env.ELEVENLABS_API_KEY.substring(0, 6) + "..." : "MISSING";
      const voiceId = getVoiceForGender("female");

      try {
        const audioBuffer = await textToSpeech(env.ELEVENLABS_API_KEY, voiceId, "Hello, this is a test from Pidgyn.");
        return Response.json({
          success: true,
          keyPrefix,
          voiceId,
          audioBytes: audioBuffer.byteLength,
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({
          success: false,
          keyPrefix,
          voiceId,
          error: String(err),
        }, { status: 500, headers: corsHeaders });
      }
    }

    // --- VOICE BIO TRANSLATION ---
    // Translate a voice bio text to the requesting user's language, return TTS audio

    if (url.pathname === "/api/translate-bio" && request.method === "POST") {
      const { textToTranslate, sourceLang, targetLang, voiceId: requestedVoiceId, gender: requestedGender } = await request.json() as any;

      if (!textToTranslate || !sourceLang || !targetLang) {
        return Response.json({ error: "Missing fields" }, { status: 400, headers: corsHeaders });
      }

      const { translateText } = await import("./translation");
      const { textToSpeech, audioToBase64, getVoiceForGender } = await import("./elevenlabs");

      // Translate the bio text
      const translated = await translateText(env.AI, textToTranslate, sourceLang, targetLang);

      // Generate TTS in target language — prefer cloned voice if available
      let audio: string | null = null;
      let ttsError: string | null = null;
      try {
        const voiceId = requestedVoiceId || getVoiceForGender(requestedGender || "female");
        console.log("TTS request: voice=", voiceId, "cloned=", !!requestedVoiceId, "text=", translated.substring(0, 50));
        const audioBuffer = await textToSpeech(env.ELEVENLABS_API_KEY, voiceId, translated);
        audio = audioToBase64(audioBuffer);
      } catch (err) {
        ttsError = String(err);
        console.error("TTS error:", err);
      }

      return Response.json({ translatedText: translated, audio, error: ttsError }, { headers: corsHeaders });
    }

    // --- VOICE CLONING ---
    // Clone a user's voice from their voice bio

    if (url.pathname === "/api/clone-voice" && request.method === "POST") {
      const { userId, name, audio, format } = await request.json() as any;
      if (!audio || !userId || !name) {
        return Response.json({ error: "Missing fields" }, { status: 400, headers: corsHeaders });
      }

      const { cloneVoice } = await import("./elevenlabs");

      try {
        const voiceId = await cloneVoice(env.ELEVENLABS_API_KEY, name, audio, format || "wav");

        // Store the voice ID on the user's profile
        const doId = env.USER_DIRECTORY.idFromName("global");
        const stub = env.USER_DIRECTORY.get(doId);
        const setUrl = new URL(request.url);
        setUrl.pathname = "/set-voice";
        await stub.fetch(new Request(setUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, clonedVoiceId: voiceId }),
        }));

        return Response.json({ success: true, voiceId }, { headers: corsHeaders });
      } catch (err) {
        console.error("Voice clone error:", err);
        return Response.json({ error: "Clone failed: " + String(err) }, { status: 500, headers: corsHeaders });
      }
    }

    // --- STT (Speech-to-Text) ---
    // Transcribe audio for voice bio recording

    if (url.pathname === "/api/stt" && request.method === "POST") {
      const { audio } = await request.json() as any;
      if (!audio) {
        return Response.json({ error: "No audio" }, { status: 400, headers: corsHeaders });
      }

      try {
        // Decode base64 to binary
        const binaryString = atob(audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Use Workers AI Whisper for STT — no external API needed
        const result = await env.AI.run("@cf/openai/whisper", {
          audio: [...bytes],
        });

        let text = ((result as any).text || "").trim();
        // Cap at 500 chars to prevent runaway transcription
        if (text.length > 500) text = text.substring(0, 500);
        // Basic repetition filter: if same 3-word phrase appears 4+ times, truncate
        const words = text.split(/\s+/);
        if (words.length > 15) {
          const trigrams: Record<string, number> = {};
          for (let i = 0; i < words.length - 2; i++) {
            const tri = words.slice(i, i+3).join(' ').toLowerCase();
            trigrams[tri] = (trigrams[tri] || 0) + 1;
          }
          const maxRep = Math.max(...Object.values(trigrams));
          if (maxRep >= 4) {
            text = words.slice(0, 15).join(' ') + '...';
          }
        }
        return Response.json({ text }, { headers: corsHeaders });
      } catch (err) {
        console.error("Whisper STT error:", err);
        return Response.json({ error: "STT failed: " + String(err) }, { status: 500, headers: corsHeaders });
      }
    }

    // --- CHAT ROOM WEBSOCKET ---
    // Connect to a chat room for a matched pair

    if (url.pathname.startsWith("/api/chat/")) {
      const roomId = url.pathname.split("/api/chat/")[1];
      if (!roomId) {
        return new Response("roomId required", { status: 400 });
      }

      const doId = env.CHAT_ROOM.idFromName(roomId);
      const stub = env.CHAT_ROOM.get(doId);

      const doUrl = new URL(request.url);
      doUrl.pathname = "/ws";
      doUrl.searchParams.set("roomId", roomId);
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // --- CHAT HISTORY ---

    if (url.pathname.startsWith("/api/chat-history/")) {
      const roomId = url.pathname.split("/api/chat-history/")[1];
      const doId = env.CHAT_ROOM.idFromName(roomId);
      const stub = env.CHAT_ROOM.get(doId);

      const doUrl = new URL(request.url);
      doUrl.pathname = "/history";
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // Everything else falls through to static assets
    return new Response("Not Found", { status: 404 });
  },
};
