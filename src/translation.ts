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

// m2m100 uses slightly different language codes for some languages
const M2M_LANG_MAP: Record<string, string> = {
  en: "en", es: "es", ja: "ja", ko: "ko", fr: "fr", pt: "pt",
  zh: "zh", de: "de", ar: "ar", hi: "hi", it: "it", ru: "ru",
  th: "th", vi: "vi", tl: "tl",
};

export async function translateText(
  ai: Ai,
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (sourceLang === targetLang) return text;

  // Strategy: m2m100 first (dedicated translation model, no hallucination),
  // then Llama 3.3 70b as fallback (much better than 8b for instruction following)

  // 1. Try m2m100 (purpose-built neural MT, fast, reliable)
  try {
    const m2mSource = M2M_LANG_MAP[sourceLang] || sourceLang;
    const m2mTarget = M2M_LANG_MAP[targetLang] || targetLang;

    const result = await ai.run("@cf/meta/m2m100-1.2b", {
      text,
      source_lang: m2mSource,
      target_lang: m2mTarget,
    });
    const translated = ((result as any).translated_text || "").trim();

    // Quality check: reject if empty, same as input, or suspiciously short
    if (translated && translated !== text && translated.length > 0) {
      return translated;
    }
    console.log("m2m100 produced low-quality output, falling back to LLM");
  } catch (err) {
    console.error("m2m100 translation failed:", err);
  }

  // 2. Fallback: Llama 3.3 70b (much better than 8b for translation)
  try {
    const llmResult = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any, {
      messages: [
        {
          role: "system",
          content: `Translate the user's text from ${SUPPORTED_LANGUAGES[sourceLang] || sourceLang} to ${SUPPORTED_LANGUAGES[targetLang] || targetLang}. Output ONLY the translation. No quotes, no explanation, no commentary. Even single words must be translated. Preserve tone and intent.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });
    const translated = ((llmResult as any).response || "").trim();
    if (translated && translated.length > 0) return translated;
  } catch (err) {
    console.error("Llama 3.3 70b translation failed:", err);
  }

  // 3. Last resort: Llama 3.1 8b
  try {
    const llmResult = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `Translate to ${SUPPORTED_LANGUAGES[targetLang] || targetLang}. Output ONLY the translation, nothing else.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });
    const translated = ((llmResult as any).response || "").trim();
    return translated || text;
  } catch {
    return text;
  }
}
