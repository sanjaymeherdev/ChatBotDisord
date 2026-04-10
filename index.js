// Discord Bot + Web Server Integration
// Handles both Discord messages and website chat widget
// Uses ONLY Discord - No Supabase
// AI Auto-Reply powered by Groq
// Knowledge Base fetched externally — no redeploy needed to update

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuration
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CATEGORY_ID: process.env.CATEGORY_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  KNOWLEDGE_URL: process.env.KNOWLEDGE_URL || 'https://sanjaymeherdev.netlify.app/knowledge.json',
  KNOWLEDGE_REFRESH_HOURS: 6,
  PORT: process.env.PORT || 5000
};

if (!CONFIG.DISCORD_TOKEN) { console.error('❌ DISCORD_TOKEN required'); process.exit(1); }
if (!CONFIG.CATEGORY_ID)   { console.error('❌ CATEGORY_ID required');   process.exit(1); }
if (!CONFIG.GROQ_API_KEY)  { console.error('❌ GROQ_API_KEY required');   process.exit(1); }

// ============================================================
// KNOWLEDGE BASE — fetched from Netlify, refreshed every 6hrs
// ============================================================
let knowledgeBase = null;
let knowledgeLastFetched = null;

function buildSystemPrompt(knowledge) {
  if (!knowledge) {
    return `You are a support assistant for Sanjay Meher (Champ Gaming / SanjayAIDev), a Godot 4 game developer.
Knowledge base is currently unavailable. Direct users to contact Sanjay:
- WhatsApp: https://wa.me/917504704502
- Instagram: https://instagram.com/freelance.sanjay
- Discord: https://discord.gg/3TKfQw3qmn`;
  }

  const { about, products, services, guides, faq } = knowledge;

  const productList = products.map(p =>
    `• ${p.name} (${p.category}) — ${p.price}\n  ${p.short_description}\n  Features: ${p.features.slice(0, 5).join(', ')}`
  ).join('\n\n');

  const faqList = faq.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');

  return `You are a support assistant for ${about.name} (${about.brand}), an Indian indie Godot 4 game developer.
Answer ONLY from the knowledge below. Be concise and friendly.
If you cannot answer, give the contact links at the bottom.

=== ABOUT ===
${about.description}
Stats: ${about.stats.systems} systems, ${about.stats.ai_integrations} AI integrations, ${about.stats.complete_games} complete games.

=== PRODUCTS (${products.length} total) ===
${productList}

=== SERVICES ===

CGRelay (Multiplayer Relay):
- ${services.cgrelay.description}
- Best for: ${services.cgrelay.best_for}
- Pricing: Starter ${services.cgrelay.pricing.starter} | Small Group ${services.cgrelay.pricing.small_group} | Custom ${services.cgrelay.pricing.custom}
- Examples: ${services.cgrelay.pricing.examples}
- Free trial available (max 4 peers, no payment): ${services.cgrelay.free_trial.download}
- Bundles: Basic Sync ${services.cgrelay.bundles.basic_sync} | Party Game ${services.cgrelay.bundles.party_game}
- Godot: ${services.cgrelay.godot_version}

GodotConnect (P2P Zero IP Exposure):
- ${services.godotconnect.description}
- Best for: ${services.godotconnect.best_for}
- Pricing: Starter ${services.godotconnect.pricing.starter} | Lobby ${services.godotconnect.pricing.lobby} | Custom ${services.godotconnect.pricing.custom}
- Examples: ${services.godotconnect.pricing.examples}
- Features: ${services.godotconnect.features.join(', ')}

GodotMP (Done-For-You Setup):
- ${services.godotmp.description}
- P2P/Relay: ${services.godotmp.models.p2p_enet} | Dedicated Core: ${services.godotmp.models.dedicated_core} | Full RPC: ${services.godotmp.models.dedicated_full_rpc}
- Includes: ${services.godotmp.includes.join(', ')}

=== GUIDES ===
- AdMob Guide: ${guides.admob.url} — ${guides.admob.summary}
- Unity Ads Guide: ${guides.unityads.url} — ${guides.unityads.summary}
- CGRelay Trial: ${guides.cgrelay_trial.url} — ${guides.cgrelay_trial.summary}

=== FAQ ===
${faqList}

=== CONTACT (use when you cannot answer) ===
- WhatsApp: ${about.contact.whatsapp}
- Instagram: ${about.contact.instagram}
- Discord: ${about.contact.discord}`;
}

async function fetchKnowledgeBase() {
  try {
    console.log(`📚 Fetching knowledge base from ${CONFIG.KNOWLEDGE_URL}...`);
    const response = await fetch(CONFIG.KNOWLEDGE_URL, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    knowledgeBase = await response.json();
    knowledgeLastFetched = new Date();
    console.log(`✅ Knowledge base loaded at ${knowledgeLastFetched.toLocaleTimeString()}`);
    console.log(`📦 Products: ${knowledgeBase.products?.length || 0} | Services: ${Object.keys(knowledgeBase.services || {}).length}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to fetch knowledge base:', error.message);
    return false;
  }
}

function startKnowledgeRefresh() {
  const intervalMs = CONFIG.KNOWLEDGE_REFRESH_HOURS * 60 * 60 * 1000;
  setInterval(async () => {
    console.log('🔄 Refreshing knowledge base...');
    await fetchKnowledgeBase();
  }, intervalMs);
  console.log(`✅ Knowledge base will refresh every ${CONFIG.KNOWLEDGE_REFRESH_HOURS} hours`);
}

// ============================================================
// GROQ AI AUTO-REPLY
// ============================================================
async function getAIReply(userMessage, conversationHistory = []) {
  try {
    const systemPrompt = buildSystemPrompt(knowledgeBase);
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
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-6),
          { role: 'user', content: userMessage }
        ]
      })
    });
    if (!response.ok) throw new Error(`Groq API error: ${await response.text()}`);
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
  if (!messageStore.has(ticketId)) messageStore.set(ticketId, []);
  const message = { ticket_id: ticketId, sender, message: messageText, created_at: new Date().toISOString() };
  messageStore.get(ticketId).push(message);
  console.log(`💾 Stored message for ${ticketId} from ${sender}`);
  return message;
}

function getMessages(ticketId) { return messageStore.get(ticketId) || []; }

function getConversationHistory(ticketId) {
  return getMessages(ticketId)
    .filter(m => ['user', 'support', 'bot'].includes(m.sender))
    .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.message }));
}

// ============================================================
// EXPRESS + DISCORD
// ============================================================
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log(`🏠 Guilds: ${client.guilds.cache.size}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.parentId !== CONFIG.CATEGORY_ID) return;
  const ticketMatch = message.channel.name.match(/ticket-(tkt-[a-z0-9-]+)/i);
  if (!ticketMatch) return;
  const ticketId = ticketMatch[1].toUpperCase();
  try {
    storeMessage(ticketId, 'support', message.content);
    await message.react('✅');
  } catch (error) {
    console.error('❌ Error:', error);
    await message.react('❌');
  }
});

// ============================================================
// DISCORD HELPERS
// ============================================================
async function createTicketChannel(ticketId, userName) {
  const guild = client.guilds.cache.first();
  if (!guild) throw new Error('Bot is not in any server');
  const category = guild.channels.cache.get(CONFIG.CATEGORY_ID);
  if (!category) throw new Error('Category not found');
  const channelName = `ticket-${ticketId.toLowerCase()}`;
  const existing = guild.channels.cache.find(ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID);
  if (existing) return existing;
  const channel = await guild.channels.create({
    name: channelName, type: ChannelType.GuildText,
    parent: CONFIG.CATEGORY_ID, topic: `Support ticket for ${userName} - ${ticketId}`
  });
  await channel.send(`🎫 **New Support Ticket**\n**Ticket ID:** ${ticketId}\n**User:** ${userName}\n\n*AI will auto-reply to user. Type here to override with a human reply.*`);
  return channel;
}

async function sendToDiscordChannel(ticketId, userName, message) {
  const guild = client.guilds.cache.first();
  if (!guild) throw new Error('Bot is not in any server');
  const channelName = `ticket-${ticketId.toLowerCase()}`;
  let channel = guild.channels.cache.find(ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID);
  if (!channel) channel = await createTicketChannel(ticketId, userName);
  await channel.send(`**${userName}:** ${message}`);
  return true;
}

async function sendAIReplyToDiscord(ticketId, aiReply) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channelName = `ticket-${ticketId.toLowerCase()}`;
  const channel = guild.channels.cache.find(ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID);
  if (channel) await channel.send(`🤖 **AI Reply:** ${aiReply}`);
}

// ============================================================
// API ENDPOINTS
// ============================================================
app.get('/', (req, res) => res.json({
  status: 'online', service: 'Discord Bot + Groq AI',
  discord: client.user ? `Connected as ${client.user.tag}` : 'Connecting...',
  activeTickets: messageStore.size,
  knowledgeBase: knowledgeLastFetched ? `Loaded at ${knowledgeLastFetched.toLocaleTimeString()}` : 'Not loaded',
  knowledgeUrl: CONFIG.KNOWLEDGE_URL
}));

app.get('/health', (req, res) => res.json({
  status: 'healthy',
  discord: client.user ? `connected as ${client.user.tag}` : 'disconnected',
  uptime: process.uptime(), activeTickets: messageStore.size,
  knowledgeBase: { loaded: !!knowledgeBase, lastFetched: knowledgeLastFetched, products: knowledgeBase?.products?.length || 0, url: CONFIG.KNOWLEDGE_URL },
  memory: process.memoryUsage()
}));

app.get('/ping', (req, res) => res.json({ pong: Date.now(), status: 'active', uptime: process.uptime() }));
app.get('/status', (req, res) => res.json({ online: true, discord: client.isReady(), tickets: messageStore.size }));

// Force refresh knowledge base manually — just hit this endpoint!
app.post('/api/refresh_knowledge', async (req, res) => {
  const success = await fetchKnowledgeBase();
  res.json({
    success,
    message: success ? '✅ Knowledge base refreshed!' : '❌ Failed to fetch',
    lastFetched: knowledgeLastFetched,
    products: knowledgeBase?.products?.length || 0
  });
});

app.post('/api/new_chat', async (req, res) => {
  try {
    const { userName, ticketId } = req.body;
    if (!userName || !ticketId) return res.status(400).json({ success: false, error: 'userName and ticketId required' });
    await createTicketChannel(ticketId, userName);
    const welcome = `Hello ${userName}! 👋 I'm Sanjay's AI assistant. I can help with CGRelay, GodotConnect, GodotMP, AdMob/Unity Ads plugins, and all products. What do you need help with?`;
    storeMessage(ticketId, 'bot', welcome);
    res.json({ success: true, ticketId, message: 'Chat started successfully' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/continue_chat', async (req, res) => {
  try {
    const { userName, ticketId } = req.body;
    if (!userName || !ticketId) return res.status(400).json({ success: false, error: 'userName and ticketId required' });
    res.json({ success: true, ticketId, message: 'Chat continued successfully' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/user_message', async (req, res) => {
  try {
    const { userName, ticketId, message } = req.body;
    if (!ticketId || !message) return res.status(400).json({ success: false, error: 'ticketId and message required' });
    storeMessage(ticketId, 'user', message);
    await sendToDiscordChannel(ticketId, userName, message);
    const history = getConversationHistory(ticketId);
    const aiReply = await getAIReply(message, history);
    storeMessage(ticketId, 'bot', aiReply);
    await sendAIReplyToDiscord(ticketId, aiReply);
    res.json({ success: true, message: 'Message sent successfully', aiReply });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/get_messages', async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId required' });
    res.json({ success: true, messages: getMessages(ticketId) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================
// SELF-PINGER
// ============================================================
function startSelfPinger() {
  setInterval(async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${CONFIG.PORT}`;
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();
      console.log(`❤️ Keep-alive at ${new Date().toLocaleTimeString()} — KB: ${data.knowledgeBase?.loaded ? '✅' : '❌'}`);
    } catch (error) { console.log(`⚠️ Keep-alive failed: ${error.message}`); }
  }, 4 * 60 * 1000);
}

// ============================================================
// START
// ============================================================
const server = app.listen(CONFIG.PORT, '0.0.0.0', async () => {
  console.log(`🌐 Web server running on port ${CONFIG.PORT}`);
  console.log(`🤖 Groq AI: ${CONFIG.GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`📚 Knowledge URL: ${CONFIG.KNOWLEDGE_URL}`);
  await fetchKnowledgeBase();
  startKnowledgeRefresh();
  startSelfPinger();
});

client.login(CONFIG.DISCORD_TOKEN).catch(error => { console.error('❌ Failed to login:', error); process.exit(1); });
server.on('error', (error) => { console.error('❌ Server error:', error); });
process.on('unhandledRejection', (error) => { console.error('❌ Unhandled rejection:', error); });
process.on('uncaughtException', (error) => { console.error('❌ Uncaught exception:', error); process.exit(1); });

console.log('🚀 Starting...');
console.log('📋 Required env vars: DISCORD_TOKEN, CATEGORY_ID, GROQ_API_KEY');
console.log('📋 Optional: KNOWLEDGE_URL (default: sanjaymeherdev.netlify.app/knowledge.json)');
