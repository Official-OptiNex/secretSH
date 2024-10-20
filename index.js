const fetch = require('node-fetch');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const keep_alive = require('./keep_alive.js');

// Replace these with your actual values
const DISCORD_BOT_TOKEN = process.env.TOKEN; // Access the bot token directly
const CHANNEL_ID = '1293775455329062922'; // Your channel ID here

// Toggle for using mock data
const useMockData = false; // Set to true to use mock data 

// Initialize Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Function to read and write data to a file for storage purposes
function readStorage() {
    try {
        const data = fs.readFileSync("storage.json");
        return JSON.parse(data);
    } catch (error) {
        return {
            currentRainId: null,
            messageSent: false,
            embedMessageId: null, // Store the embed message ID
        };
    }
}

function writeStorage(data) {
    fs.writeFileSync("storage.json", JSON.stringify(data));
}

// Function to read mock rain data from mockrain.json
function readMockRainData() {
    try {
        const data = fs.readFileSync("mockrain.json");
        const mockData = JSON.parse(data);

        // Automatically set the 'created' timestamp to the current time
        mockData.created = Date.now(); // Set to current time in milliseconds

        return mockData;
    } catch (error) {
        console.error("Error reading mock rain data:", error);
        return null;
    }
}

// Function to fetch Roblox avatar URL
async function fetchRobloxAvatar(username, retries = 3) {
    try {
        const userIdResponse = await fetch(`https://users.roblox.com/v1/users/search?keyword=${username}`);
        const userIdData = await userIdResponse.json();

        if (userIdData.data && userIdData.data.length > 0) {
            const userId = userIdData.data[0].id;

            const pfpResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
            const pfpData = await pfpResponse.json();

            if (pfpData.data && pfpData.data.length > 0) {
                const profilePictureUrl = pfpData.data[0].imageUrl;
                console.log(`Profile picture URL for ${username}: ${profilePictureUrl}`);
                return profilePictureUrl;
            } else {
                console.error("Failed to retrieve profile picture.");
            }
        } else {
            console.error("User not found.");
        }
    } catch (error) {
        console.error("Error fetching profile picture:", error);

        if (retries > 0) {
            console.log(`Retrying... Attempts left: ${retries}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            return fetchRobloxAvatar(username, retries - 1);
        }
    }
    return null; // Return null if user is not found after retries
}

// Function to check for rain events
async function checkRain() {
    const apiUrl = "https://api.bloxflip.com/chat/history";

    try {
        let rain;

        if (useMockData) {
            rain = readMockRainData();
        } else {
            const response = await fetch(apiUrl);
            const data = await response.json();
            rain = data.rain;
        }

        const { currentRainId, messageSent, embedMessageId } = readStorage();

        if (rain && rain.active && rain.id !== currentRainId) {
            const { id, prize, host, created, duration } = rain;
            const endTime = new Date(created + duration);

            const avatarUrl = await fetchRobloxAvatar(host);
            
            const embed = new EmbedBuilder()
                .setTitle(`**Active Rain**`)
                .setColor(0x00ffff)
                .setTimestamp()
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: '**Amount:**', value: `⏣${prize.toLocaleString()}`, inline: true },
                    { name: '**Participants:**', value: `0`, inline: true },
                    { name: '**Robux each:**', value: `⏣${(0).toLocaleString()}`, inline: true },
                    { name: '**Host:**', value: host, inline: false },
                    { name: '**Ends in:**', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: false },
                    { name: '\u200B', value: '[Click to Join Rain](https://bloxflip.com/)', inline: false }
                )
                .setFooter({ text: "Credits to: BloxTools" });

            embed.setDescription(`<@&1293774007224762471>`);

            const channel = await client.channels.fetch(CHANNEL_ID);
            const message = await channel.send({ embeds: [embed] });

            console.log("New notification sent.");

            writeStorage({
                currentRainId: id,
                messageSent: true,
                embedMessageId: message.id, 
            });

            setInterval(() => updateEmbed(channel, message.id, prize), 1500);
        } else if (!rain.active && messageSent) {
            writeStorage({
                currentRainId,
                messageSent: false,
                embedMessageId: null,
            });
            console.log("Rain event ended. Ready for the next event.");
        } else {
            console.log("No new rain event detected.");
        }
    } catch (error) {
        console.error("Error fetching rain data:", error);
    }
}

// Function to update the embed with participant count and Robux per player
async function updateEmbed(channel, messageId, totalPrize) {
    const apiUrl = "https://api.bloxflip.com/chat/history";

    try {
        let rain;

        if (useMockData) {
            rain = readMockRainData();
        } else {
            const response = await fetch(apiUrl);
            const data = await response.json();
            rain = data.rain;
        }

        if (rain && rain.active) {
            const participants = rain.players.length;
            const robuxPerPlayer = participants > 0 ? (totalPrize / participants).toLocaleString() : '0';

            const message = await channel.messages.fetch(messageId);

            const embed = message.embeds[0];
            embed.fields[1].value = `${participants.toLocaleString()}`;
            embed.fields[2].value = `⏣${robuxPerPlayer}`;

            await message.edit({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Error updating embed:", error);
    }
}

// Event when the bot is ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`${client.user.tag} Is now checking for BloxFlip rain events every 5 seconds, and updating any rain embeds every 1.5 seconds`);
    setInterval(checkRain, 5 * 1000);
    checkRain();
});

client.login(DISCORD_BOT_TOKEN);
