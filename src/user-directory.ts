import { DurableObject } from "cloudflare:workers";

// Single global directory of all users — handles profiles, browsing, and matching

interface UserProfileData {
  userId: string;
  name: string;
  language: string;
  gender: string;          // "male" or "female"
  photo: string;           // base64 data URL or empty
  voiceBioAudio: string;   // base64 audio of voice bio in their language
  voiceBioText: string;    // STT transcription of voice bio
  clonedVoiceId: string;   // ElevenLabs cloned voice ID
  interests: string[];     // userIds they've tapped "interested" on
  matches: string[];       // mutual matches
  createdAt: number;
}

interface Env {
  AI: Ai;
  ELEVENLABS_API_KEY: string;
  USER_DIRECTORY: DurableObjectNamespace;
  CHAT_ROOM: DurableObjectNamespace;
}

export class UserDirectory extends DurableObject<Env> {
  private users: Record<string, UserProfileData>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.users = {};
  }

  private async loadState(): Promise<void> {
    const stored = await this.ctx.storage.get<Record<string, UserProfileData>>("users");
    if (stored) this.users = stored;
  }

  private async saveState(): Promise<void> {
    await this.ctx.storage.put("users", this.users);
  }

  async fetch(request: Request): Promise<Response> {
    await this.loadState();
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Create or update profile
      if (path === "/signup" && request.method === "POST") {
        const body = await request.json() as any;
        const { userId, name, language, gender, photo, voiceBioAudio, voiceBioText } = body;

        if (!userId || !name || !language) {
          return Response.json({ error: "userId, name, and language required" }, { status: 400, headers: corsHeaders });
        }

        const existing = this.users[userId];
        this.users[userId] = {
          userId,
          name,
          language,
          gender: gender || "female",
          photo: photo || "",
          voiceBioAudio: "",  // Don't store raw audio — too large for SQLite. Text is enough.
          voiceBioText: voiceBioText || "",
        clonedVoiceId: existing?.clonedVoiceId || "",  // ElevenLabs cloned voice ID
          interests: existing?.interests || [],
          matches: existing?.matches || [],
          createdAt: existing?.createdAt || Date.now(),
        };
        await this.saveState();

        return Response.json({ success: true, profile: this.sanitizeProfile(this.users[userId]) }, { headers: corsHeaders });
      }

      // Get own profile
      if (path === "/profile" && request.method === "GET") {
        const userId = url.searchParams.get("userId");
        if (!userId || !this.users[userId]) {
          return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
        }
        return Response.json({ profile: this.users[userId] }, { headers: corsHeaders });
      }

      // Browse profiles (exclude self)
      if (path === "/browse" && request.method === "GET") {
        const userId = url.searchParams.get("userId") || "";
        const myLang = this.users[userId]?.language || "en";
        const myMatches = this.users[userId]?.matches || [];
        const profiles = Object.values(this.users)
          .filter(u => u.userId !== userId && !myMatches.includes(u.userId))
          .map(u => this.sanitizeProfile(u))
          .sort((a, b) => {
            // Different language first (the whole point of Pidgyn)
            const aForeign = a.language !== myLang ? 1 : 0;
            const bForeign = b.language !== myLang ? 1 : 0;
            if (bForeign !== aForeign) return bForeign - aForeign;
            // Has voice bio second
            const aBio = a.voiceBioText ? 1 : 0;
            const bBio = b.voiceBioText ? 1 : 0;
            if (bBio !== aBio) return bBio - aBio;
            // Has cloned voice third
            const aClone = a.clonedVoiceId ? 1 : 0;
            const bClone = b.clonedVoiceId ? 1 : 0;
            if (bClone !== aClone) return bClone - aClone;
            // Random shuffle within same tier
            return Math.random() - 0.5;
          });
        return Response.json({ profiles }, { headers: corsHeaders });
      }

      // Express interest
      if (path === "/interest" && request.method === "POST") {
        const body = await request.json() as any;
        const { userId, targetId } = body;

        if (!userId || !targetId || !this.users[userId] || !this.users[targetId]) {
          return Response.json({ error: "Invalid users" }, { status: 400, headers: corsHeaders });
        }

        const user = this.users[userId];
        const target = this.users[targetId];

        // Add interest if not already there
        if (!user.interests.includes(targetId)) {
          user.interests.push(targetId);
        }

        // Check for mutual match
        let matched = false;
        if (target.interests.includes(userId)) {
          // It's a match!
          if (!user.matches.includes(targetId)) {
            user.matches.push(targetId);
          }
          if (!target.matches.includes(userId)) {
            target.matches.push(userId);
          }
          matched = true;
        }

        await this.saveState();
        return Response.json({ success: true, matched, matchName: matched ? target.name : null }, { headers: corsHeaders });
      }

      // Get matches
      if (path === "/matches" && request.method === "GET") {
        const userId = url.searchParams.get("userId") || "";
        const user = this.users[userId];
        if (!user) {
          return Response.json({ matches: [] }, { headers: corsHeaders });
        }

        const matches = user.matches.map(matchId => {
          const m = this.users[matchId];
          if (!m) return null;
          return {
            matchId,
            name: m.name,
            language: m.language,
            photo: m.photo,
            // Generate a consistent room ID for this pair
            chatRoomId: [userId, matchId].sort().join("-"),
          };
        }).filter(Boolean);

        return Response.json({ matches }, { headers: corsHeaders });
      }

      // Reset all profiles (admin)
      if (path === "/reset" && request.method === "POST") {
        this.users = {};
        await this.saveState();
        return Response.json({ success: true, message: "All profiles cleared" }, { headers: corsHeaders });
      }

      // Set cloned voice ID
      if (path === "/set-voice" && request.method === "POST") {
        const body = await request.json() as any;
        const { userId, clonedVoiceId } = body;
        if (userId && this.users[userId] && clonedVoiceId) {
          this.users[userId].clonedVoiceId = clonedVoiceId;
          await this.saveState();
          return Response.json({ success: true }, { headers: corsHeaders });
        }
        return Response.json({ error: "Invalid" }, { status: 400, headers: corsHeaders });
      }

      // Get a user's cloned voice ID
      if (path === "/get-voice" && request.method === "GET") {
        const userId = url.searchParams.get("userId");
        if (userId && this.users[userId]) {
          return Response.json({ clonedVoiceId: this.users[userId].clonedVoiceId || "" }, { headers: corsHeaders });
        }
        return Response.json({ clonedVoiceId: "" }, { headers: corsHeaders });
      }

      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders });
    }
  }

  // Strip sensitive data for public profile listing
  private sanitizeProfile(user: UserProfileData): any {
    return {
      userId: user.userId,
      name: user.name,
      language: user.language,
      photo: user.photo,
      voiceBioText: user.voiceBioText,
      voiceBioAudio: user.voiceBioAudio,
      clonedVoiceId: user.clonedVoiceId || "",
      gender: user.gender || "female",
      createdAt: user.createdAt,
    };
  }
}
