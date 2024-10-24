const fetch = require('node-fetch');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, REST, Routes } = require('discord.js');
const keep_alive = require('./keep_alive.js');

// Replace these with your actual values
const DISCORD_BOT_TOKEN = process.env.TOKEN; // Access the bot token directly
const CHANNEL_ID = process.env.CHANNEL; // Your channel ID here
const GUILD_ID = process.env.GUILD_ID; // Your guild ID here for registering commands

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

function writeStorage(data) {
    fs.writeFileSync("storage.json", JSON.stringify(data));
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
            rain = readMockRainData();  // If using mock data, you should have a function to load it
        } else {
            const response = await fetch(apiUrl);
            const data = await response.json();
            rain = data.rain;
        }

        // Load stored data from storage.json
        const { currentRainId, messageSent } = readStorage();

        if (rain && rain.active) {
            if (rain.id !== currentRainId) {
                // A new rain event is detected
                const { id, prize, host, created, duration } = rain;
                
                // Calculate the end time of the rain event
                const endTime = created + duration;
                const endTimeInSeconds = Math.floor(endTime / 1000) - 60;  // Convert milliseconds to Unix seconds

                // Fetch the host's avatar
                const avatarUrl = await fetchRobloxAvatar(host);

                // Create the embed for the new rain event
                const embed = new EmbedBuilder()
                    .setTitle(`**Active Rain**`)
                    .setColor(0x00ffff)
                    .setTimestamp()  // Discord's own timestamp for when the embed was created
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: 'Host', value: host, inline: true },
                        { name: 'Amount', value: `⏣ ${prize.toLocaleString()}`, inline: true },
                        { 
                            name: 'Ends in', 
                            value: `<t:${endTimeInSeconds}:R>`,  // Discord will handle the countdown
                            inline: true 
                        },
                        { name: 'Link', value: '[Click to Join Rain](https://bloxflip.com)', inline: false }  // Add link as a field
                    )
                    .setFooter({ text: "Credits to: BloxBetting" })
                    
                // Fetch the channel
                const channel = await client.channels.fetch(CHANNEL_ID);
                
                // Send a message mentioning the notification role before the embed
                await channel.send(`<@&1297927023909539890>`);  // Mention the role
                
                // Send the embed message
                await channel.send({ embeds: [embed] });

                console.log("New rain event notification sent.");

                // Update storage.json with the current rain details
                writeStorage({
                    currentRainId: id,
                    messageSent: true,
                    embedMessageId: null, // No longer tracking message IDs
                });
            }
        } else if (!rain.active && messageSent) {
            // Reset the messageSent flag in storage.json
            writeStorage({
                currentRainId: null,
                messageSent: false,
                embedMessageId: null, // Clear embed message ID when rain ends
            });
            console.log("Rain event ended. Ready for the next event.");
        } else {
            // console.log("No new rain event detected.");
        }
    } catch (error) {
        console.error("Error fetching rain data:", error);
    }
}

// Function to register slash commands
async function registerCommands() {
    const commands = [
        {
            name: 'info',
            description: 'Get information about the bot and its creator.',
        },
    ];

    const rest = new REST({ version: '9' }).setToken(DISCORD_BOT_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

// Event when the bot is ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`${client.user.tag} is now checking for BloxFlip rain events every 10 seconds.`);

    // Set custom rich presence with streaming activity
    client.user.setActivity('BloxFlip Rains', { 
        type: ActivityType.Watching // Watching activity type
    });

    // Register commands when the bot starts
    registerCommands();

    // Run the checkRain function every 10 seconds
    setInterval(checkRain, 10 * 1000);
    // Run once on start
    checkRain();
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'info') {
        const embed = new EmbedBuilder()
            .setTitle('Bot Information')
            .setDescription('This bot monitors BloxFlip for active rain events and sends notifications with rain information.')
            .addFields(
                { name: 'Creator', value: '[BloxBetting](https://youtube.com/@BloxBetting)', inline: true },
                { name: 'Purpose', value: 'To notify users about rain events on BloxFlip.', inline: true }
            )
            .setColor(0x00ffff)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

// Log in to Discord with your bot token
client.login(DISCORD_BOT_TOKEN);
