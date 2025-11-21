// Discord Bot + Web Server Integration
// Handles both Discord messages and website chat widget
// Uses ONLY Discord - No Supabase

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Add fetch import for Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuration - ONLY use environment variables on Render
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CATEGORY_ID: process.env.CATEGORY_ID,
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

// In-memory storage for messages
const messageStore = new Map();

// Initialize Express Server
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log('🔄 Monitoring ticket channels for support messages...');
  console.log(`🏠 Server: ${client.guilds.cache.size} guilds`);
});

// Message handler - Listen for support replies in Discord
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in ticket channels (within the Live Chat category)
  if (message.channel.parentId !== CONFIG.CATEGORY_ID) return;

  // Extract ticket ID from channel name (format: ticket-tkt-xxxxx)
  const channelName = message.channel.name;
  const ticketMatch = channelName.match(/ticket-(tkt-[a-z0-9-]+)/i);

  if (!ticketMatch) {
    console.log('⚠️ Could not extract ticket ID from channel:', channelName);
    return;
  }

  const ticketId = ticketMatch[1].toUpperCase();
  const supportMessage = message.content;

  console.log(`📨 Support message in ${ticketId}: ${supportMessage}`);

  try {
    // Store message in memory
    storeMessage(ticketId, 'support', supportMessage);

    // React to confirm message was processed
    await message.react('✅');

    console.log(`✅ Message stored for ticket ${ticketId}`);
  } catch (error) {
    console.error('❌ Error processing message:', error);
    await message.react('❌');
  }
});

// Store message in memory
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

// Get messages from memory
function getMessages(ticketId) {
  return messageStore.get(ticketId) || [];
}

// Create Discord channel for ticket
async function createTicketChannel(ticketId, userName) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      throw new Error('Bot is not in any server');
    }

    const category = guild.channels.cache.get(CONFIG.CATEGORY_ID);
    if (!category) {
      throw new Error('Category not found. Please check CATEGORY_ID');
    }

    const channelName = `ticket-${ticketId.toLowerCase()}`;
    
    // Check if channel already exists
    const existingChannel = guild.channels.cache.find(
      ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID
    );
    
    if (existingChannel) {
      console.log(`📢 Channel already exists: ${channelName}`);
      return existingChannel;
    }

    // Create new channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CONFIG.CATEGORY_ID,
      topic: `Support ticket for ${userName} - ${ticketId}`
    });

    console.log(`✅ Created Discord channel: ${channelName}`);
    
    // Send welcome message in Discord
    await channel.send(`🎫 **New Support Ticket**\n**Ticket ID:** ${ticketId}\n**User:** ${userName}\n\n*Waiting for user message...*`);
    
    return channel;
  } catch (error) {
    console.error('Error creating Discord channel:', error);
    throw error;
  }
}

// Send message to Discord channel
async function sendToDiscordChannel(ticketId, userName, message) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      throw new Error('Bot is not in any server');
    }

    const channelName = `ticket-${ticketId.toLowerCase()}`;
    let channel = guild.channels.cache.find(
      ch => ch.name === channelName && ch.parentId === CONFIG.CATEGORY_ID
    );

    if (!channel) {
      console.log(`Channel not found, creating: ${channelName}`);
      channel = await createTicketChannel(ticketId, userName);
    }

    // Send message to Discord
    await channel.send(`**${userName}:** ${message}`);
    console.log(`📤 Sent to Discord: ${message}`);
    
    return true;
  } catch (error) {
    console.error('Error sending to Discord:', error);
    throw error;
  }
}

// Web API Endpoints for Chat Widget

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Discord Bot + Chat API',
    discord: client.user ? `Connected as ${client.user.tag}` : 'Connecting...',
    activeTickets: messageStore.size,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'Discord Chat Support',
    timestamp: new Date().toISOString(),
    discord: client.user ? `connected as ${client.user.tag}` : 'disconnected',
    uptime: process.uptime(),
    activeTickets: messageStore.size,
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Simple ping endpoint
app.get('/ping', (req, res) => {
  res.json({ 
    pong: Date.now(),
    status: 'active',
    uptime: process.uptime()
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    online: true,
    timestamp: Date.now(),
    discord: client.isReady(),
    tickets: messageStore.size
  });
});

// Start new chat
app.post('/api/new_chat', async (req, res) => {
  try {
    const { userName, ticketId } = req.body;
    
    if (!userName || !ticketId) {
      return res.status(400).json({ success: false, error: 'userName and ticketId required' });
    }

    console.log(`🆕 New chat started: ${ticketId} by ${userName}`);
    
    // Create Discord channel
    await createTicketChannel(ticketId, userName);
    
    // Store welcome message
    const welcomeMessage = `Hello ${userName}! How can we help you today?`;
    storeMessage(ticketId, 'bot', welcomeMessage);
    
    res.json({ 
      success: true, 
      ticketId: ticketId,
      message: 'Chat started successfully' 
    });
    
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
    
    res.json({ 
      success: true, 
      ticketId: ticketId,
      message: 'Chat continued successfully' 
    });
    
  } catch (error) {
    console.error('Error in continue_chat:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Receive user message from website
app.post('/api/user_message', async (req, res) => {
  try {
    const { userName, ticketId, message } = req.body;
    
    if (!ticketId || !message) {
      return res.status(400).json({ success: false, error: 'ticketId and message required' });
    }

    console.log(`📨 User message from ${userName} (${ticketId}): ${message}`);
    
    // Store in memory
    storeMessage(ticketId, 'user', message);
    
    // Send to Discord channel
    await sendToDiscordChannel(ticketId, userName, message);
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully' 
    });
    
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
    
    res.json({ 
      success: true, 
      messages: messages 
    });
    
  } catch (error) {
    console.error('Error in get_messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === SELF-PINGER KEEP-ALIVE SYSTEM === //
function startSelfPinger() {
  console.log('🔧 Initializing internal keep-alive system...');
  
  setInterval(async () => {
    try {
      // Use Render's external URL or fallback to localhost
      const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${CONFIG.PORT}`;
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();
      
      console.log(`❤️ Keep-alive ping at ${new Date().toLocaleTimeString()} - Status: ${data.status}`);
    } catch (error) {
      console.log(`⚠️ Keep-alive ping failed: ${error.message}`);
    }
  }, 4 * 60 * 1000); // 4 minutes
  
  console.log('✅ Internal keep-alive system started!');
}

// Start Express Server first
const server = app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${CONFIG.PORT}`);
  console.log(`🏠 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://0.0.0.0:${CONFIG.PORT}/health`);
  
  // Start self-pinger after server is ready
  startSelfPinger();
});

// Then login to Discord
client.login(CONFIG.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});

// Enhanced error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

console.log('🚀 Application starting...');
console.log(`📋 Required env vars: DISCORD_TOKEN, CATEGORY_ID`);
