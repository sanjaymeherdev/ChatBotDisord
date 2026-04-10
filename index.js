// Discord Bot + Web Server Integration
// Handles both Discord messages and website chat widget
// Uses ONLY Discord - No Supabase
// AI Auto-Reply powered by Groq

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuration
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CATEGORY_ID: process.env.CATEGORY_ID,
  GUILD_ID: process.env.GUILD_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  PORT: process.env.PORT || 5000
};

// Validate required environment variables
if (!CONFIG.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN environment variable is required');
  process.exit(1);
}
if (!CONFIG.CATEGORY_ID) {
  console.error('❌ ERROR: CATEGORY_ID environment variable is required');
  process.exit(1);
}
if (!CONFIG.GROQ_API_KEY) {
  console.error('❌ ERROR: GROQ_API_KEY environment variable is required');
  process.exit(1);
}

// ============================================================
// KNOWLEDGE BASE — built from your website pages
// ============================================================
const KNOWLEDGE_BASE = `
You are a support assistant for Sanjay Meher (Champ Gaming / SanjayAIDev), an Indian indie game developer
who sells Godot 4 multiplayer systems, AI integrations, plugins, and game dev tools.
Your job is to answer user questions based ONLY on the information below.
Be concise, friendly, and helpful. If the answer is not in the knowledge base, say so and give contact info.

--- ABOUT SANJAY ---
- Indian indie game developer building production-ready Godot 4 systems
- 50+ systems built and used in real games
- Products: multiplayer backends, AI integrations, plugins, complete games
- WhatsApp: https://wa.me/917504704502
- Instagram: https://instagram.com/freelance.sanjay
- Discord: https://discord.gg/3TKfQw3qmn

--- CGRELAY (Multiplayer Relay Server) ---
- WebSocket relay server for casual Godot 4 games
- Drop-in CGClient.gd script — set Game ID, call join(), done
- Always online 24/7, never spins down
- 3 sync modes: send_realtime(), send_on_change(), send_once()
- Suitable for: casual games, party games, turn-based, simple co-op
- NOT for competitive FPS (use dedicated server for that)
- Each Game ID is fully isolated (no cross-game bleed)
- Supports proximity filtering
- Pricing:
  * Starter: Rs. 100/month — 6 concurrent peers
  * Small Group: Rs. 200/month — 16 concurrent peers
  * Custom: Rs. 50 base + Rs. 10 per peer/month
  * Example: 10 peers = Rs. 150/mo, 20 peers = Rs. 250/mo, 50 peers = Rs. 550/mo
- Payment: UPI / bank transfer. Contact via WhatsApp or contact page.
- Free trial available: working Godot 4 demo project, no payment needed, shared Game ID, max 4 peers
- Trial download: https://drive.google.com/drive/folders/1B5iXzPfFQAweqX95AFnE0_D78giwqy-y
- Godot version: 4.x, tested on 4.4.1
- Script bundles available:
  * Basic Sync Bundle: Rs. 199 one-time (position, rotation, animation sync)
  * Party Game Bundle: Rs. 299 one-time (lobby, ready-up, turn manager, score sync)
  * FPS Bundle: Rs. 499 (coming soon)
  * Card/Board Game Bundle: Rs. 299 (coming soon)

--- GODOTCONNECT (P2P Multiplayer with Zero IP Exposure) ---
- Direct P2P multiplayer using Netbird virtual IPs
- Real player IP is NEVER shared with other players
- Uses native ENet — no relay overhead, low latency
- Up to 50 players per game
- Host migration built-in — if host disconnects, session continues
- Auth, lobby, chat, avatars included (Supabase-backed)
- Cross-platform: Android, Windows, Linux, macOS, Web
- Players do a ONE-TIME 60-second Netbird app setup (free, open-source)
- Web players use browser flow — no install needed
- Pricing:
  * Starter: Rs. 150/month — up to 6 players (Rs. 100 base + 5 players x Rs. 10)
  * Multiplayer Lobby: Rs. 260/month — up to 16 players
  * Custom: Rs. 100 base + Rs. 10 per player, up to 50 players
  * Example: 10 players = Rs. 200/mo, 20 players = Rs. 300/mo, 50 players = Rs. 600/mo
- Contact to get started: YouTube @Champ_gaming or WhatsApp
- Godot version: 4.x, tested on 4.4

--- GODOTMP (Done-For-You Multiplayer Setup Service) ---
- Sanjay builds your multiplayer network for you
- Models available:
  * P2P + ENET: Rs. 500 one-time
  * Relay Service (CGRelay or private): Rs. 500 one-time
  * Dedicated Server Core: Rs. 800 one-time
  * Dedicated + Full RPC: Rs. 800+ (quote after consultation)
- Pay ONLY after testing — no upfront fee
- 24-hour delivery
- 3 free changes after delivery
- Add-ons:
  * Relay No-Code Sync: +Rs. 300
  * Code Generator: +Rs. 200
  * Custom Video Walkthrough: +Rs. 200
  * Extended Support (3 months): +Rs. 500
- You choose your own hosting (Render, Fly.io, VPS) for dedicated servers
- Contact: WhatsApp https://wa.me/917504704502

--- ADMOB PLUGIN FOR GODOT 4.4 ---
- Price: $4 one-time on itch.io
- Supports 5 ad types: Banner, Interstitial, Rewarded, Rewarded Interstitial, App Open
- Unity Mediation supported
- Drop-in addons/ folder — enable plugin in Project Settings
- Must use Release Keystore + Release APK export for real ads
- Must add AdMob App ID to AndroidManifest.xml inside <application> tag
- Test IDs pre-configured in admob.gd — swap to real IDs for production
- Call order: set_*_ad_unit() → initialize() → load_*() → show_*()
- Common issues:
  * App crashes on launch → Missing AndroidManifest meta-data (App ID)
  * Ads work in test but not production → still using test IDs or debug keystore
  * Banner not visible → show_banner() called before load_banner()
  * Interstitial shows, scene doesn't change → must wait for interstitial_closed signal
  * Gradle build fails → enable Use Gradle Build in export settings
- Real ads require app published on Play Store (at least internal testing)
- Supports AdMob mediation with Unity Ads and other networks

--- UNITY ADS PLUGIN FOR GODOT 4.4 ---
- Price: $4 one-time on itch.io
- Supports 3 ad types: Banner, Interstitial, Rewarded
- NO manual AndroidManifest editing needed (auto-injected by plugin)
- Folder name MUST stay unity_ads_plugin (hardcoded in export plugin)
- Get Game ID from Unity Dashboard → Monetization → Ad Units
- Banner placement (Banner_Android) must be created MANUALLY in Unity Dashboard
- Interstitial and Rewarded placements are auto-created
- Call order: initialize() → wait for on_initialization_complete → load_*() → show_*()
- Auto-retry built-in: if ad fails to load, retries after 5 seconds
- TEST_MODE = true for development, false for production release
- NEVER release with TEST_MODE = true
- Common issues:
  * Banner never appears → Banner_Android placement not created in Unity Dashboard
  * Ads work in test not production → TEST_MODE still true or debug keystore used
  * Initialization fails → wrong or empty Game ID
  * UnityAds singleton not found → plugin not enabled in Project Settings
- Use Unity Ads + AdMob together for maximum fill rate and revenue

--- CHOOSING BETWEEN CGRELAY AND GODOTCONNECT ---
- CGRelay: best for casual/party games, simpler setup, no companion app needed
- GodotConnect: best when player IP privacy matters, lower latency than relay, up to 50 players
- GodotMP: use when you want Sanjay to build the whole network for you

--- CONTACT / NO ANSWER AVAILABLE ---
If a question cannot be answered from the above knowledge:
- WhatsApp: https://wa.me/917504704502
- Instagram: https://instagram.com/freelance.sanjay
- Discord: https://discord.gg/3TKfQw3qmn
`;

// ============================================================
// GROQ AI AUTO-REPLY
// ============================================================
async function getAIReply(userMessage, conversationHistory = []) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 512,
        messages: [
          {
            role: 'system',
            content: KNOWLEDGE_BASE
          },
          ...conversationHistory.slice(-6),
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error: ${err}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
  } catch (error) {
    console.error('❌ Groq AI error:', error);
    return `Sorry, I'm having trouble right now. Please contact Sanjay directly:\n\n📱 WhatsApp: https://wa.me/917504704502\n📸 Instagram: https://instagram.com/freelance.sanjay\n💬 Discord: https://discord.gg/3TKfQw3qmn`;
  }
}

// ============================================================
// IN-MEMORY STORAGE
// ============================================================
const messageStore = new Map();

function storeMessage(ticketId, sender, messageText) {
  if (!messageStore.has(ticketId)) {
    messageStore.set(ticketId, []);
  }
  const message = {
    ticket_id: ticketId,
    sender: sender,
    message: messageText,
    created_at: new Date().toISOString()
  };
  messageStore.get(ticketId).push(message);
  console.log(`💾 Stored message for ${ticketId} from ${sender}`);
  return message;
}

function getMessages(ticketId) {
  return messageStore.get(ticketId) || [];
}

function getConversationHistory(ticketId) {
  const messages = getMessages(ticketId);
  return messages
    .filter(m => m.sender === 'user' || m.sender === 'support' || m.sender === 'bot')
    .map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.message
    }));
}

// ============================================================
// EXPRESS SERVER
// ============================================================
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ============================================================
// DISCORD CLIENT
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log('🔄 Monitoring ticket channels for support messages...');
  console.log(`🏠 Server: ${client.guilds.cache.size} guilds`);
});

// Listen for human support replies in Discord
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.parentId !== CONFIG.CATEGORY_ID) return;

  const channelName = message.channel.name;
  const ticketMatch = channelName.match(/ticket-(tkt-[a-z0-9-]+)/i);

  if (!ticketMatch) {
    console.log('⚠️ Could not extract ticket ID from channel:', channelName);
    return;
  }

  const ticketId = ticketMatch[1].toUpperCase();
  const supportMessage = message.content;

  console.log(`📨 Human support reply in ${ticketId}: ${supportMessage}`);

  try {
    storeMessage(ticketId, 'support', supportMessage);
    await message.react('✅');
    console.log(`✅ Human reply stored for ticket ${ticketId}`);
  } catch (error) {
    console.error('❌ Error processing message:', error);
    await message.react('❌');
  }
});

// ============================================================
// DISCORD CHANNEL HELPERS
// ============================================================
function getGuild() {
  if (CONFIG.GUILD_ID) {
    return client.guilds.cache.get(CONFIG.GUILD_ID);
  }
  return client.guilds.cache.first();
}

async function createTicketChannel(ticketId, userName) {
  try {
    const guild = getGuild();
    if (!guild) throw new Error('Bot is not in any server');

    const category = guild.channels.cache.get(CONFIG.CATEGORY_ID);
    if (!category) throw new Error('Category not found. Please check CATEGORY_ID');

    const channelName = `ticket-${ticketId.toLowerCase()}`;
    const existingChannel = guild.channels.cache.find(
      ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID
    );

    if (existingChannel) {
      console.log(`📢 Channel already exists: ${channelName}`);
      return existingChannel;
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CONFIG.CATEGORY_ID,
      topic: `Support ticket for ${userName} - ${ticketId}`
    });

    console.log(`✅ Created Discord channel: ${channelName}`);

    await channel.send(
      `🎫 **New Support Ticket**\n` +
      `**Ticket ID:** ${ticketId}\n` +
      `**User:** ${userName}\n\n` +
      `*AI will auto-reply to user. Type here to override with a human reply.*`
    );

    return channel;
  } catch (error) {
    console.error('Error creating Discord channel:', error);
    throw error;
  }
}

async function sendToDiscordChannel(ticketId, userName, message) {
  try {
    const guild = getGuild();
    if (!guild) throw new Error('Bot is not in any server');

    const channelName = `ticket-${ticketId.toLowerCase()}`;
    let channel = guild.channels.cache.find(
      ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID
    );

    if (!channel) {
      console.log(`Channel not found, creating: ${channelName}`);
      channel = await createTicketChannel(ticketId, userName);
    }

    await channel.send(`**${userName}:** ${message}`);
    console.log(`📤 Sent to Discord: ${message}`);
    return true;
  } catch (error) {
    console.error('Error sending to Discord:', error);
    throw error;
  }
}

async function sendAIReplyToDiscord(ticketId, aiReply) {
  try {
    const guild = getGuild();
    if (!guild) return;

    const channelName = `ticket-${ticketId.toLowerCase()}`;
    const channel = guild.channels.cache.find(
      ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID
    );

    if (channel) {
      await channel.send(`🤖 **AI Reply:** ${aiReply}`);
    }
  } catch (error) {
    console.error('Error sending AI reply to Discord:', error);
  }
}

// ============================================================
// API ENDPOINTS
// ============================================================

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Discord Bot + Chat API + Groq AI',
    discord: client.user ? `Connected as ${client.user.tag}` : 'Connecting...',
    activeTickets: messageStore.size,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Discord Chat Support + Groq AI',
    timestamp: new Date().toISOString(),
    discord: client.user ? `connected as ${client.user.tag}` : 'disconnected',
    uptime: process.uptime(),
    activeTickets: messageStore.size,
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/ping', (req, res) => {
  res.json({ pong: Date.now(), status: 'active', uptime: process.uptime() });
});

app.get('/status', (req, res) => {
  res.json({ online: true, timestamp: Date.now(), discord: client.isReady(), tickets: messageStore.size });
});

// Start new chat
app.post('/api/new_chat', async (req, res) => {
  try {
    const { userName, ticketId } = req.body;
    if (!userName || !ticketId) {
      return res.status(400).json({ success: false, error: 'userName and ticketId required' });
    }

    console.log(`🆕 New chat started: ${ticketId} by ${userName}`);
    await createTicketChannel(ticketId, userName);

    const welcomeMessage = `Hello ${userName}! 👋 I'm Sanjay's AI assistant. I can help with CGRelay, GodotConnect, GodotMP, AdMob/Unity Ads plugins, and more. What do you need help with?`;
    storeMessage(ticketId, 'bot', welcomeMessage);

    res.json({ success: true, ticketId, message: 'Chat started successfully' });
  } catch (error) {
    console.error('Error in new_chat:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Continue existing chat
app.post('/api/continue_chat', async (req, res) => {
  try {
    const { userName, ticketId } = req.body;
    if (!userName || !ticketId) {
      return res.status(400).json({ success: false, error: 'userName and ticketId required' });
    }
    console.log(`🔄 Continuing chat: ${ticketId} by ${userName}`);
    res.json({ success: true, ticketId, message: 'Chat continued successfully' });
  } catch (error) {
    console.error('Error in continue_chat:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Receive user message — AI auto-replies
app.post('/api/user_message', async (req, res) => {
  try {
    const { userName, ticketId, message } = req.body;
    if (!ticketId || !message) {
      return res.status(400).json({ success: false, error: 'ticketId and message required' });
    }

    console.log(`📨 User message from ${userName} (${ticketId}): ${message}`);

    // Store user message
    storeMessage(ticketId, 'user', message);

    // Send user message to Discord
    await sendToDiscordChannel(ticketId, userName, message);

    // Get conversation history for context
    const history = getConversationHistory(ticketId);

    // Get AI reply
    console.log(`🤖 Getting AI reply for ${ticketId}...`);
    const aiReply = await getAIReply(message, history);

    // Store AI reply
    storeMessage(ticketId, 'bot', aiReply);

    // Also send AI reply to Discord channel so support team can see it
    await sendAIReplyToDiscord(ticketId, aiReply);

    res.json({ success: true, message: 'Message sent successfully', aiReply });
  } catch (error) {
    console.error('Error in user_message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get messages for a ticket
app.post('/api/get_messages', async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId required' });
    }
    const messages = getMessages(ticketId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error in get_messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// SELF-PINGER KEEP-ALIVE
// ============================================================
function startSelfPinger() {
  console.log('🔧 Initializing internal keep-alive system...');
  setInterval(async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${CONFIG.PORT}`;
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();
      console.log(`❤️ Keep-alive ping at ${new Date().toLocaleTimeString()} - Status: ${data.status}`);
    } catch (error) {
      console.log(`⚠️ Keep-alive ping failed: ${error.message}`);
    }
  }, 4 * 60 * 1000);
  console.log('✅ Internal keep-alive system started!');
}

// ============================================================
// START
// ============================================================
const server = app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${CONFIG.PORT}`);
  console.log(`🏠 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://0.0.0.0:${CONFIG.PORT}/health`);
  console.log(`🤖 Groq AI: ${CONFIG.GROQ_API_KEY ? 'Configured ✅' : 'MISSING ❌'}`);
  startSelfPinger();
});

client.login(CONFIG.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});

server.on('error', (error) => { console.error('❌ Server error:', error); });
process.on('unhandledRejection', (error) => { console.error('❌ Unhandled promise rejection:', error); });
process.on('uncaughtException', (error) => { console.error('❌ Uncaught exception:', error); process.exit(1); });

console.log('🚀 Application starting...');
console.log(`📋 Required env vars: DISCORD_TOKEN, CATEGORY_ID, GROQ_API_KEY`);
console.log(`📋 Optional env vars: GUILD_ID (recommended)`);
