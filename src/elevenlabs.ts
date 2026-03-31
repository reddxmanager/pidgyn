// ElevenLabs API helpers for Pidgyn

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Default voices per language — pick warm, friendly voices from ElevenLabs library
// Replace these with actual voice IDs from https://elevenlabs.io/voice-library
// Rachel (21m00Tcm4TlvDq8ikWAM) is a default voice available on ALL ElevenLabs accounts
// eleven_flash_v2_5 for low-latency, high-reliability multilingual TTS
export const LANGUAGE_VOICES: Record<string, string> = {
  en: "21m00Tcm4TlvDq8ikWAM",  // Rachel - default female
  es: "21m00Tcm4TlvDq8ikWAM",
  ja: "21m00Tcm4TlvDq8ikWAM",
  ko: "21m00Tcm4TlvDq8ikWAM",
  fr: "21m00Tcm4TlvDq8ikWAM",
  pt: "21m00Tcm4TlvDq8ikWAM",
  zh: "21m00Tcm4TlvDq8ikWAM",
  de: "21m00Tcm4TlvDq8ikWAM",
  ar: "21m00Tcm4TlvDq8ikWAM",
  hi: "21m00Tcm4TlvDq8ikWAM",
  it: "21m00Tcm4TlvDq8ikWAM",
  ru: "21m00Tcm4TlvDq8ikWAM",
  th: "21m00Tcm4TlvDq8ikWAM",
  vi: "21m00Tcm4TlvDq8ikWAM",
  tl: "21m00Tcm4TlvDq8ikWAM",
};

export async function textToSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<ArrayBuffer> {
  const response = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS error: ${response.status} ${err}`);
  }

  return response.arrayBuffer();
}

// STT is handled by Workers AI Whisper — see index.ts /api/stt endpoint
// This function is kept as a fallback but not used in the main pipeline

export function audioToBase64(audio: ArrayBuffer): string {
  const bytes = new Uint8Array(audio);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/mpeg;base64,${btoa(binary)}`;
}

export function getVoiceForLanguage(lang: string): string {
  return LANGUAGE_VOICES[lang] || LANGUAGE_VOICES["en"];
}

// Clone a user's voice from their voice bio audio
// Returns the new voice_id that sounds like them
export async function cloneVoice(
  apiKey: string,
  name: string,
  audioBase64: string,
  format: string = "wav"
): Promise<string> {
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));

  // Use native FormData + File
  const ext = format === "wav" ? "wav" : "webm";
  const mime = format === "wav" ? "audio/wav" : "audio/webm";
  const file = new File([bytes], `voice.${ext}`, { type: mime });
  const formData = new FormData();
  formData.append("name", `Pidgyn-${name}`);
  formData.append("description", `Voice clone for Pidgyn user ${name}`);
  formData.append("files", file);
  formData.append("remove_background_noise", "true");

  const response = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voice clone error: ${response.status} ${err}`);
  }

  const result = (await response.json()) as { voice_id?: string };
  if (!result.voice_id) throw new Error("No voice_id returned from clone");
  return result.voice_id;
}
