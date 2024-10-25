const cloudscraper = require('cloudscraper');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, REST, Routes } = require('discord.js');
const keep_alive = require('./keep_alive.js');

// Replace these with your actual values
const DISCORD_BOT_TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL;
const GUILD_ID = process.env.GUILD_ID;

const useMockData = false;

// Initialize Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

function readStorage() {
    try {
        const data = fs.readFileSync("storage.json");
        return JSON.parse(data);
    } catch (error) {
        return {
            currentRainId: null,
            messageSent: false,
            embedMessageId: null,
        };
    }
}

function readMockRainData() {
    try {
        const data = fs.readFileSync("mockrain.json");
        const mockData = JSON.parse(data);
        mockData.created = Date.now();
        return mockData;
    } catch (error) {
        console.error("Error reading mock rain data:", error);
        return null;
    }
}

function writeStorage(data) {
    fs.writeFileSync("storage.json", JSON.stringify(data));
}

async function fetchRobloxAvatar(username, retries = 3) {
    try {
        const userIdResponse = await cloudscraper.get(`https://users.roblox.com/v1/users/search?keyword=${username}`);
        const userIdData = JSON.parse(userIdResponse);
        
        if (userIdData.data && userIdData.data.length > 0) {
            const userId = userIdData.data[0].id;
            const pfpResponse = await cloudscraper.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
            const pfpData = JSON.parse(pfpResponse);

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
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchRobloxAvatar(username, retries - 1);
        }
    }
    return null;
}

async function checkRain() {
    const apiUrl = "https://api.bloxflip.com/chat/history";

    try {
        let rain;

        if (useMockData) {
            rain = readMockRainData();
        } else {
            const response = await cloudscraper.get(apiUrl);
            const data = JSON.parse(response);
            rain = data.rain;
        }

        const { currentRainId, messageSent } = readStorage();

        if (rain && rain.active) {
            if (rain.id !== currentRainId) {
                const { id, prize, host, created, duration } = rain;
                
                const endTime = created + duration;
                const endTimeInSeconds = Math.floor(endTime / 1000) - 60;

                const avatarUrl = await fetchRobloxAvatar(host);

                const embed = new EmbedBuilder()
                    .setTitle(`**Active Rain**`)
                    .setColor(0x00ffff)
                    .setTimestamp()
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: 'Host', value: host, inline: true },
                        { name: 'Amount', value: `⏣ ${prize.toLocaleString()}`, inline: true },
                        { 
                            name: 'Ends in', 
                            value: `<t:${endTimeInSeconds}:R>`,
                            inline: true 
                        },
                        { name: 'Link', value: '[Click to Join Rain](https://bloxflip.com)', inline: false }
                    )
                    .setFooter({ text: "Credits to: BloxBetting" });
                    
                const channel = await client.channels.fetch(CHANNEL_ID);
                
                await channel.send(`<@&1297927023909539890>`);
                await channel.send({ embeds: [embed] });

                console.log("New rain event notification sent.");

                writeStorage({
                    currentRainId: id,
                    messageSent: true,
                    embedMessageId: null,
                });
            }
        } else if (!rain.active && messageSent) {
            writeStorage({
                currentRainId: null,
                messageSent: false,
                embedMessageId: null,
            });
            console.log("Rain event ended. Ready for the next event.");
        } else {
            // console.log("No new rain event detected.");
        }
    } catch (error) {
        console.error("Error fetching rain data:", error);
    }
}

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

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`${client.user.tag} is now checking for BloxFlip rain events every 10 seconds.`);

    client.user.setActivity('BloxFlip Rains', { 
        type: ActivityType.Watching 
    });

    registerCommands();

    setInterval(checkRain, 10 * 1000);
    checkRain();
});

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

client.login(DISCORD_BOT_TOKEN);
