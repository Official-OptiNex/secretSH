const fetch = require('node-fetch');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const keep_alive = require('./keep_alive.js');

// Replace these with your actual values
const DISCORD_BOT_TOKEN = process.env.TOKEN;
const CHANNEL_ID = '1293775455329062922'; // Your channel ID here

// Toggle for using mock data
const useMockData = false; 

// Cache for storing fetched rain data temporarily
let rainCache = null;

// Initialize Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Helper function to read storage once and cache the data in memory
let storageCache = null;
function readStorage() {
    if (!storageCache) {
        try {
            const data = fs.readFileSync("storage.json");
            storageCache = JSON.parse(data);
        } catch (error) {
            storageCache = {
                currentRainId: null,
                messageSent: false,
                embedMessageId: null,
            };
        }
    }
    return storageCache;
}

// Write to storage only when necessary
function writeStorage(data) {
    storageCache = data;
    fs.writeFileSync("storage.json", JSON.stringify(data));
}

// Function to read mock rain data
function readMockRainData() {
    try {
        const data = fs.readFileSync("mockrain.json");
        const mockData = JSON.parse(data);

        // Automatically set the 'created' timestamp to the current time
        mockData.created = Date.now(); 
        return mockData;
    } catch (error) {
        console.error("Error reading mock rain data:", error);
        return null;
    }
}

// Fetch Roblox avatar URL with caching to reduce redundant requests
async function fetchRobloxAvatar(username, retries = 3) {
    try {
        const userIdResponse = await fetch(https://users.roblox.com/v1/users/search?keyword=${username});
        const userIdData = await userIdResponse.json();

        if (userIdData.data && userIdData.data.length > 0) {
            const userId = userIdData.data[0].id;

            const pfpResponse = await fetch(https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false);
            const pfpData = await pfpResponse.json();

            if (pfpData.data && pfpData.data.length > 0) {
                return pfpData.data[0].imageUrl;
            }
        }
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchRobloxAvatar(username, retries - 1);
        }
    }
    return null;
}

// Function to fetch rain event data with caching to reduce redundant API calls
async function fetchRainData() {
    if (useMockData) {
        return readMockRainData();
    }

    if (!rainCache) {
        try {
            const response = await fetch("https://api.bloxflip.com/chat/history");
            const data = await response.json();
            rainCache = data.rain;
        } catch (error) {
            console.error("Error fetching rain data:", error);
        }
    }
    return rainCache;
}

// Function to check for rain events
async function checkRain() {
    try {
        const rain = await fetchRainData();

        const { currentRainId, messageSent, embedMessageId } = readStorage();

        if (rain && rain.active && rain.id !== currentRainId) {
            const { id, prize, host, created, duration } = rain;
            const endTime = new Date(created + duration);
            const avatarUrl = await fetchRobloxAvatar(host);

            const embed = new EmbedBuilder()
                .setTitle(**Active Rain**)
                .setColor(0x00ffff)
                .setTimestamp()
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: '**Amount:**', value: ⏣${prize.toLocaleString()}, inline: true },
                    { name: '**Participants:**', value: 0, inline: true },
                    { name: '**Robux each:**', value: ⏣0, inline: true },
                    { name: '**Host:**', value: host, inline: false },
                    { name: '**Ends in:**', value: <t:${Math.floor(endTime / 1000)}:R>, inline: false },
                    { name: '\u200B', value: '[Click to Join Rain](https://bloxflip.com/)', inline: false }
                )
                .setFooter({ text: "Credits to: BloxTools" });

            embed.setDescription(<@&1293774007224762471>);

            const channel = await client.channels.fetch(CHANNEL_ID);
            const message = await channel.send({ embeds: [embed] });

            writeStorage({
                currentRainId: id,
                messageSent: true,
                embedMessageId: message.id,
            });

            const updateInterval = setInterval(async () => {
                await updateEmbed(channel, message.id, prize);
                // Stop the interval after rain ends
                if (!rain.active) {
                    clearInterval(updateInterval);
                }
            }, 1500);
        } else if (!rain.active && messageSent) {
            writeStorage({
                currentRainId,
                messageSent: false,
                embedMessageId: null,
            });
        }
    } catch (error) {
        console.error("Error fetching rain data:", error);
    }
}

// Function to update the embed with participant count and Robux per player
async function updateEmbed(channel, messageId, totalPrize) {
    try {
        const rain = await fetchRainData();
        if (rain && rain.active) {
            const participants = rain.players.length;
            const robuxPerPlayer = participants > 0 ? (totalPrize / participants).toLocaleString() : '0';

            const message = await channel.messages.fetch(messageId);
            const embed = message.embeds[0];

            embed.fields[1].value = ${participants.toLocaleString()};
            embed.fields[2].value = ⏣${robuxPerPlayer};

            await message.edit({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Error updating embed:", error);
    }
}

// Event when the bot is ready
client.on('ready', () => {
    console.log(Logged in as ${client.user.tag});
    setInterval(checkRain, 5000);
    checkRain();
});

client.login(DISCORD_BOT_TOKEN);
