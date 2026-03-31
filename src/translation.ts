// Translation helper using Workers AI

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  pt: "Portuguese",
  zh: "Chinese",
  de: "German",
  ar: "Arabic",
  hi: "Hindi",
  it: "Italian",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  tl: "Filipino",
};

export async function translateText(
  ai: Ai,
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (sourceLang === targetLang) return text;

  // Use LLM for translation — much better quality than m2m100
  try {
    const llmResult = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `You are a translation engine. You receive text in ${SUPPORTED_LANGUAGES[sourceLang] || sourceLang} and output ONLY the ${SUPPORTED_LANGUAGES[targetLang] || targetLang} translation. Rules:\n- Output ONLY the translated text, nothing else\n- No quotes, no explanation, no commentary, no preamble\n- Do NOT say you cannot translate or that text is missing\n- Even single words or short phrases must be translated\n- Preserve tone: casual stays casual, flirty stays flirty\n- If unsure, give your best translation attempt`,
        },
        { role: "user", content: `Translate this to ${SUPPORTED_LANGUAGES[targetLang] || targetLang}: ${text}` },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });
    const translated = ((llmResult as any).response || "").trim();
    return translated || text;
  } catch (err) {
    console.error("LLM translation failed, falling back to m2m100:", err);

    // Fallback: m2m100
    try {
      const result = await ai.run("@cf/meta/m2m100-1.2b", {
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
      });
      return (result as any).translated_text || text;
    } catch {
      return text;
    }
  }
}
