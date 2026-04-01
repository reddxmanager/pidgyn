import { DurableObject } from "cloudflare:workers";
import { translateText } from "./translation";
import { textToSpeech, audioToBase64, getVoiceForGender } from "./elevenlabs";

interface Env {
  AI: Ai;
  ELEVENLABS_API_KEY: string;
  CHAT_ROOM: DurableObjectNamespace;
}

interface Participant {
  userId: string;
  name: string;
  language: string;
  gender: string;          // "male" or "female" for stock voice fallback
  clonedVoiceId: string;  // Their ElevenLabs cloned voice
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  translatedAudio: string | null;  // base64 TTS audio in receiver's language
  timestamp: number;
}

interface RoomState {
  roomId: string;
  participants: Record<string, Participant>;
  messages: ChatMessage[];
}

export class ChatRoom extends DurableObject<Env> {
  private state: RoomState;
  private connections: Map<string, WebSocket>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.connections = new Map();
    this.state = {
      roomId: "",
      participants: {},
      messages: [],
    };
  }

  private async loadState(): Promise<void> {
    const stored = await this.ctx.storage.get<RoomState>("roomState");
    if (stored) this.state = stored;
  }

  private async saveState(): Promise<void> {
    await this.ctx.storage.put("roomState", this.state);
  }

  async fetch(request: Request): Promise<Response> {
    await this.loadState();
    const url = new URL(request.url);

    if (url.searchParams.has("roomId") && !this.state.roomId) {
      this.state.roomId = url.searchParams.get("roomId")!;
      await this.saveState();
    }

    // WebSocket upgrade for real-time chat
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const userId = url.searchParams.get("userId") || "";

      server.accept();
      this.connections.set(userId, server);

      server.addEventListener("message", async (event) => {
        try {
          await this.handleMessage(userId, JSON.parse(event.data as string));
        } catch (err) {
          server.send(JSON.stringify({
            type: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      });

      server.addEventListener("close", () => {
        this.connections.delete(userId);
        this.broadcast({ type: "user_disconnected", userId }, userId);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST: get chat history
    if (url.pathname.endsWith("/history")) {
      return Response.json({
        messages: this.state.messages.map(m => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          originalText: m.originalText,
          translatedText: m.translatedText,
          translatedAudio: m.translatedAudio,
          timestamp: m.timestamp,
        })),
      });
    }

    return new Response("Pidgyn Chat", { status: 200 });
  }

  private async handleMessage(userId: string, data: any): Promise<void> {
    switch (data.type) {
      case "join":
        await this.handleJoin(userId, data.name, data.language, data.clonedVoiceId, data.gender);
        break;
      case "text_message":
        await this.handleTextMessage(userId, data.text);
        break;
      case "voice_message":
        await this.handleVoiceMessage(userId, data.audio);
        break;
      case "typing":
        this.broadcast({ type: "typing", userId, name: this.state.participants[userId]?.name }, userId);
        break;
    }
  }

  private async handleJoin(userId: string, name: string, language: string, clonedVoiceId?: string, gender?: string): Promise<void> {
    this.state.participants[userId] = { userId, name, language, gender: gender || "female", clonedVoiceId: clonedVoiceId || "" };
    await this.saveState();

    // Send chat history to joining user
    const ws = this.connections.get(userId);
    if (ws) {
      ws.send(JSON.stringify({
        type: "room_state",
        roomId: this.state.roomId,
        participants: this.state.participants,
        messages: this.state.messages,
      }));
    }

    this.broadcast({ type: "user_joined", userId, name, language }, userId);
  }

  private async handleTextMessage(senderId: string, text: string): Promise<void> {
    const sender = this.state.participants[senderId];
    if (!sender) return;

    // Find the other participant
    const receiver = Object.values(this.state.participants).find(p => p.userId !== senderId);
    if (!receiver) {
      // No receiver connected yet — still save the message, they'll see it when they join
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        senderId,
        senderName: sender.name,
        originalText: text,
        translatedText: text, // Can't translate without knowing receiver's language
        translatedAudio: null,
        timestamp: Date.now(),
      };
      this.state.messages.push(message);
      await this.saveState();
      this.sendTo(senderId, { type: "message", ...message, isSelf: true });
      return;
    }

    // Broadcast "translating" state
    this.broadcast({ type: "translating", senderId });

    // Translate text
    const translatedText = await translateText(this.env.AI, text, sender.language, receiver.language);

    // Text messages: no TTS, just translated text
    const message: ChatMessage = {
      id: crypto.randomUUID(),
    senderId,
    senderName: sender.name,
    originalText: text,
      translatedText,
    translatedAudio: null,
      timestamp: Date.now(),
    };

    this.state.messages.push(message);
    if (this.state.messages.length > 200) {
    this.state.messages = this.state.messages.slice(-200);
    }
    await this.saveState();

    // Send to receiver with translated text
    this.sendTo(receiver.userId, {
      type: "message",
      ...message,
    });

    // Send back to sender
    this.sendTo(senderId, {
    type: "message",
    id: message.id,
    senderId,
      senderName: sender.name,
      originalText: text,
      translatedText,
      translatedAudio: null,
    timestamp: message.timestamp,
      isSelf: true,
    });
  }

  private async handleVoiceMessage(senderId: string, audioBase64: string): Promise<void> {
    const sender = this.state.participants[senderId];
    if (!sender) return;

    const receiver = Object.values(this.state.participants).find(p => p.userId !== senderId);

    this.broadcast({ type: "translating", senderId });

    // STT: transcribe voice using Workers AI Whisper
    let originalText: string;
    try {
      const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const result = await this.env.AI.run("@cf/openai/whisper", {
        audio: [...audioBytes],
      });
      originalText = (result as any).text || "";
      if (!originalText) throw new Error("Empty transcription");
    } catch (err) {
      console.error("Whisper STT error:", err);
      this.sendTo(senderId, { type: "error", message: "Couldn't transcribe voice. Try typing." });
      return;
    }

    if (!receiver) {
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        senderId,
        senderName: sender.name,
        originalText,
        translatedText: originalText,
        translatedAudio: null,
        timestamp: Date.now(),
      };
      this.state.messages.push(message);
      await this.saveState();
      this.sendTo(senderId, { type: "message", ...message, isSelf: true });
      return;
    }

    // Translate
    const translatedText = await translateText(this.env.AI, originalText, sender.language, receiver.language);

    // TTS in receiver's language
    let translatedAudio: string | null = null;
    try {
      // Use sender's cloned voice if available, otherwise fall back to language default
      const voiceId = sender.clonedVoiceId || getVoiceForGender(sender.gender || "female");
      const audio = await textToSpeech(this.env.ELEVENLABS_API_KEY, voiceId, translatedText);
      translatedAudio = audioToBase64(audio);
    } catch (err) {
      console.error("TTS error:", err);
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      senderId,
      senderName: sender.name,
      originalText,
      translatedText,
      translatedAudio,
      timestamp: Date.now(),
    };

    this.state.messages.push(message);
    if (this.state.messages.length > 200) {
      this.state.messages = this.state.messages.slice(-200);
    }
    await this.saveState();

    this.sendTo(receiver.userId, { type: "message", ...message });
    this.sendTo(senderId, {
      type: "message", ...message, isSelf: true,
    });
  }

  private broadcast(data: any, excludeId?: string): void {
    const msg = JSON.stringify(data);
    for (const [id, ws] of this.connections) {
      if (id !== excludeId) {
        try { ws.send(msg); } catch { this.connections.delete(id); }
      }
    }
  }

  private sendTo(userId: string, data: any): void {
    const ws = this.connections.get(userId);
    if (ws) {
      try { ws.send(JSON.stringify(data)); } catch { this.connections.delete(userId); }
    }
  }
}
