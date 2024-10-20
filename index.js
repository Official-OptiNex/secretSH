import fetch from "node-fetch";
import fs from "fs";
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
const keep_alive = require('./keep_alive.js');
// Replace these with your actual values
const DISCORD_BOT_TOKEN = 'process.env.TOKEN'; // Replace with your actual bot token
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
        // Step 1: Get the user's ID based on the username
        const userIdResponse = await fetch(`https://users.roblox.com/v1/users/search?keyword=${username}`);
        const userIdData = await userIdResponse.json();

        // Ensure a valid user is found
        if (userIdData.data && userIdData.data.length > 0) {
            const userId = userIdData.data[0].id;

            // Step 2: Get the user's profile picture using the userId
            const pfpResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
            const pfpData = await pfpResponse.json();

            // Ensure a valid profile picture URL is found
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
        
        // Retry logic
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
            // Use mock data for testing
            rain = readMockRainData();
        } else {
            const response = await fetch(apiUrl);
            const data = await response.json();
            rain = data.rain;
        }

        // Load stored data from storage.json
        const { currentRainId, messageSent, embedMessageId } = readStorage();

        if (rain && rain.active && rain.id !== currentRainId) {
            const { id, prize, host, created, duration } = rain;
            const endTime = new Date(created + duration);

            // Fetch the host's avatar
            const avatarUrl = await fetchRobloxAvatar(host);
            
            // Create the embed for the new rain event
	    const embed = new EmbedBuilder()
    	    .setTitle(`**Active Rain**`)
    	    .setColor(0x00ffff)
    	    .setTimestamp()
    	    .setThumbnail(avatarUrl) // Set the avatar URL as thumbnail
    	    .addFields(
    	        { name: '**Amount:**', value: `⏣${prize.toLocaleString()}`, inline: true },
    	        { name: '**Participants:**', value: `0`, inline: true }, // Placeholder for participant count
    	        { name: '**Robux each:**', value: `⏣${(0).toLocaleString()}`, inline: true }, // Placeholder for Robux per player
    	        { name: '**Host:**', value: host, inline: false },
    	        { name: '**Ends in:**', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: false },
    	        { name: '\u200B', value: '[Click to Join Rain](https://bloxflip.com/)', inline: false } // Link to BloxFlip
   	    )
  	    .setFooter({ text: "Credits to: BloxTools" }); // Add credits to the footer


            // Send embed message to the specified channel
            const channel = await client.channels.fetch(CHANNEL_ID);
            const message = await channel.send({ embeds: [embed] });

            console.log("New notification sent.");

            // Update storage.json with the current rain details
            writeStorage({
                currentRainId: id,
                messageSent: true,
                embedMessageId: message.id, // Save the embed message ID for future updates
            });

            // Start interval to update the embed with participant count and Robux per player
            setInterval(() => updateEmbed(channel, message.id, prize), 1 * 1000); // Update every 10 seconds
        } else if (!rain.active && messageSent) {
            // Reset the messageSent flag in storage.json
            writeStorage({
                currentRainId,
                messageSent: false,
                embedMessageId: null, // Clear embed message ID when rain ends
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
            // Use mock data for testing
            rain = readMockRainData();
        } else {
            const response = await fetch(apiUrl);
            const data = await response.json();
            rain = data.rain;
        }

        if (rain && rain.active) {
            const participants = rain.players.length;
            const robuxPerPlayer = participants > 0 ? (totalPrize / participants).toLocaleString() : '0';

            // Fetch the existing message to update
            const message = await channel.messages.fetch(messageId);

            // Update the embed
            const embed = message.embeds[0];
            embed.fields[1].value = `${participants.toLocaleString()}`; // Update participant count
            embed.fields[2].value = `⏣${robuxPerPlayer}`; // Update Robux per player

            // Edit the message with the updated embed
            await message.edit({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Error updating embed:", error);
    }
}

// Event when the bot is ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    // Run the checkRain function every 1 seconds
    setInterval(checkRain, 1 * 1000);
    // Run once on start
    checkRain();
});

// Log in to Discord with your bot token
client.login(DISCORD_BOT_TOKEN);
