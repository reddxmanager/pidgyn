// seed-profiles.mjs — Run with: node seed-profiles.mjs
// Creates fake profiles with photo avatars on the live Pidgyn instance

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = "https://app.pidgyn.workers.dev";
const AVATAR_DIR = join(process.cwd(), "avatars");

const profiles = [
  { name: "Sofia",    language: "es", gender: "female", avatar: "sofia",    bio: "Hola, me llamo Sofia. Me encanta viajar y conocer gente nueva. Soy de Barcelona y me gusta la playa y la buena comida." },
  { name: "Yuki",     language: "ja", gender: "female", avatar: "yuki",     bio: "Hi, my name is Yuki. I love cooking Japanese food and watching anime. I live in Osaka and I like hiking on weekends." },
  { name: "Marco",    language: "it", gender: "male",   avatar: "marco",    bio: "Ciao, sono Marco. Vivo a Roma e lavoro come fotografo. Mi piace il cinema, la musica e cucinare la pasta per gli amici." },
  { name: "Priya",    language: "hi", gender: "female", avatar: "priya",    bio: "Namaste, main Priya hoon. Mujhe dancing aur singing bahut pasand hai. Main Mumbai mein rehti hoon aur travel karna chahti hoon." },
  { name: "Lucas",    language: "pt", gender: "male",   avatar: "lucas",    bio: "Oi, meu nome e Lucas. Eu moro no Rio de Janeiro e adoro surfar. Gosto de musica ao vivo e de conhecer pessoas novas." },
  { name: "Hana",     language: "ko", gender: "female", avatar: "hana",     bio: "Hello, my name is Hana. I love K-drama and coffee. I live in Seoul and enjoy going to art galleries on weekends." },
  { name: "Amelie",   language: "fr", gender: "female", avatar: "amelie",   bio: "Bonjour, je suis Amelie. J'habite a Lyon et j'adore la patisserie. J'aime les promenades au bord du fleuve et la photographie." },
  { name: "Chen Wei", language: "zh", gender: "male",   avatar: "chenwei",  bio: "Hello, my name is Chen Wei. I enjoy playing piano and reading science fiction. I live in Taipei and love exploring night markets." },
  { name: "Fatima",   language: "ar", gender: "female", avatar: "fatima",   bio: "Marhaba, ana Fatima. Uhibb al-qira'a wal-safar. A'ish fi Dubai wa uhibb al-tazawwuq wal-musiqa." },
  { name: "Klaus",    language: "de", gender: "male",   avatar: "klaus",    bio: "Hallo, ich bin Klaus. Ich lebe in Berlin und mag Wandern in den Alpen. Ich spiele gern Gitarre und trinke guten Kaffee." },
  { name: "Linh",     language: "vi", gender: "female", avatar: "linh",     bio: "Xin chao, toi ten Linh. Toi song o Ha Noi va thich nau an. Toi thich di du lich va gap go ban moi." },
  { name: "Nong",     language: "th", gender: "female", avatar: "nong",     bio: "Sawadee ka, chan chue Nong. Chan chob tham aahan Thai lae pai thiao talay. Chan yoo Krungthep ka." },
  { name: "Anna",     language: "ru", gender: "female", avatar: "anna",     bio: "Privet, menya zovut Anna. Ya zhivu v Moskve i lyublyu chitat knigi. Mnye nravitsya puteshestvovat i fotografirovat." },
  { name: "Maria",    language: "tl", gender: "female", avatar: "maria",    bio: "Kumusta, ako si Maria. Mahilig ako sa pagluluto at pagbabasa. Nakatira ako sa Cebu at gusto kong pumunta sa dagat." },
  { name: "Isabella", language: "es", gender: "female", avatar: "isabella", bio: "Hola, soy Isabella de Mexico. Me encanta el arte y la musica. Busco a alguien que le guste reir y explorar el mundo." },
  { name: "Sakura",   language: "ja", gender: "female", avatar: "sakura",   bio: "Hello, I am Sakura from Tokyo. I enjoy painting watercolors and visiting temples. I love cats and green tea." },
  { name: "Giulia",   language: "it", gender: "female", avatar: "giulia",   bio: "Ciao, mi chiamo Giulia. Sono di Firenze. Amo l'arte, il buon vino e le passeggiate in campagna al tramonto." },
  { name: "Jin",      language: "ko", gender: "male",   avatar: "jin",      bio: "Hello, I am Jin from Busan. I love photography, street food, and playing basketball. Looking for someone adventurous." },
];

function loadAvatar(avatarName) {
  const path = join(AVATAR_DIR, `${avatarName}.jpg`);
  if (!existsSync(path)) {
    console.log(`  (no avatar for ${avatarName})`);
    return "";
  }
  const buf = readFileSync(path);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function seedProfile(p) {
  const userId = crypto.randomUUID();
  const photo = loadAvatar(p.avatar);
  
  try {
    const res = await fetch(`${BASE}/api/user/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        name: p.name,
        language: p.language,
        gender: p.gender,
        photo,
        voiceBioAudio: "",
        voiceBioText: p.bio,
      }),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`+ ${p.name} (${p.language}) ${photo ? '[photo]' : '[no photo]'}`);
    } else {
      console.log(`x ${p.name}: ${data.error}`);
    }
  } catch (err) {
    console.log(`x ${p.name}: ${err.message}`);
  }
}

async function main() {
  console.log(`Seeding ${profiles.length} profiles to ${BASE}...`);
  console.log(`Avatars dir: ${AVATAR_DIR}\n`);
  
  for (const p of profiles) {
    await seedProfile(p);
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log("\nDone! Refresh the Discover page.");
}

main();
