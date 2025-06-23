require('dotenv').config();

// Import necessary Discord.js classes and other modules
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs/promises');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const RSS_FEED_URL = process.env.RSS_FEED_URL || 'https://rss.app/feeds/COiTZRnT26oDqrJf.xml'; // Using provided URL as default if not Sheapgamer RSS
const RSS_CHECK_INTERVAL_MS = 900000; // 15 minutes (15 * 60 * 1000 ms)
const GUID_FILE = path.resolve(__dirname, 'last_processed_guid.json');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ]
});

const parser = new Parser();
let lastProcessedGuid = null;

/**
 * The function `loadLastProcessedGuid` asynchronously loads the last processed GUID from a file,
 * handling errors such as file not found.
 */
async function loadLastProcessedGuid() {
    try {
        const data = await fs.readFile(GUID_FILE, 'utf8');
        console.log(`Loading lastProcessedGuid from ${GUID_FILE}`);
        lastProcessedGuid = JSON.parse(data).lastGuid;
        console.log(`Loaded lastProcessedGuid: ${lastProcessedGuid}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('last_processed_guid.json not found, starting fresh.');
            lastProcessedGuid = null;
        } else {
            console.error('Error loading lastProcessedGuid:', error);
        }
    }
}

/**
 * Saves the last processed GUID to a file.
 * @param {string} guid - The GUID to save as the last processed.
 */
async function saveLastProcessedGuid(guid) {
    try {
        await fs.writeFile(GUID_FILE, JSON.stringify({ lastGuid: guid }), 'utf8');
        console.log(`Saved lastProcessedGuid: ${guid}`);
    } catch (error) {
        console.error('Error saving lastProcessedGuid:', error);
    }
}

/**
 * Extracts an image URL from an RSS entry.
 * It checks for media content, enclosure, and HTML content to find the first image.
 * @param {Object} entry - The RSS entry object.
 * @returns {string|null} - The image URL if found, otherwise null.
 */
function getImageFromEntry(entry) {
    let imageUrl = null;
    if (entry.media && entry.media.content && Array.isArray(entry.media.content)) {
        for (const media of entry.media.content) {
            if (media.url && media.type && media.type.startsWith('image/')) {
                imageUrl = media.url;
                break;
            }
        }
    }

    if (!imageUrl && entry.enclosure && entry.enclosure.url && entry.enclosure.type && entry.enclosure.type.startsWith('image/')) {
        imageUrl = entry.enclosure.url;
    }

    if (!imageUrl && (entry.summary || entry.content)) {
        const htmlContent = entry.content || entry.summary;
        const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/i);
        if (imgMatch && imgMatch[1]) {
            imageUrl = imgMatch[1];
        }
    }

    if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = null;
    }

    return imageUrl;
}


/**
 * Checks the RSS feed for new items and posts them to a Discord channel.
 * It fetches the feed, filters items based on the last processed GUID and date,
 * and sends new items as embeds to the specified Discord channel.
 * @returns {Promise<void>}
 * @throws {Error} If there is an issue with the RSS feed or Discord API.
 */
async function checkRssFeed() {
    console.log(`Checking RSS feed: ${RSS_FEED_URL}`);
    try {
        const feed = await parser.parseURL(RSS_FEED_URL);
        const channel = client.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel) {
            console.error(`Error: Could not find channel with ID ${TARGET_CHANNEL_ID}. Make sure the bot has access and developer mode is on to copy correct ID.`);
            return;
        }

        if (!feed || !feed.items || !Array.isArray(feed.items)) {
            console.log('RSS feed items are empty or malformed. Skipping post.');
            return;
        }

        const latestGuidInCurrentFeed = feed.items.length > 0
            ? (feed.items[0].guid || feed.items[0].id || feed.items[0].link || `NO_GUID_${feed.items[0].title}_${Date.now()}`)
            : null;


        if (lastProcessedGuid === null && latestGuidInCurrentFeed) {
            await saveLastProcessedGuid(latestGuidInCurrentFeed);
            lastProcessedGuid = latestGuidInCurrentFeed;
            console.log(`First run detected. Initializing lastProcessedGuid to ${lastProcessedGuid}. No posts will be sent immediately.`);
            return;
        }

        const oneDayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
        const newItemsSinceLastCheck = [];

        // Iterate from newest to oldest in the fetched feed
        for (const entry of feed.items) {
            const itemGuid = entry.guid || entry.id || entry.link || `NO_GUID_${entry.title}_${Date.now()}`;
            const itemDate = entry.isoDate ? new Date(entry.isoDate) : null;

            console.log(`Processing item: '${entry.title}' (GUID: ${itemGuid}, Date: ${itemDate ? itemDate.toISOString() : 'N/A'})`);
            if (itemGuid === lastProcessedGuid) {
                console.log(`Reached last processed GUID (${lastProcessedGuid}). Stopping processing older items.`);
                break;
            }

            // Skip items older than 1 day
            if (itemDate && itemDate < oneDayAgo) {
                console.log(`Skipping old item: '${entry.title}' (older than 1 day).`);
                continue; 
            }

            newItemsSinceLastCheck.push(entry);
        }

        // Sort items to post from oldest to newest before sending to Discord
        newItemsSinceLastCheck.sort((a, b) => new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime());

        if (newItemsSinceLastCheck.length > 0) {
            console.log(`Found ${newItemsSinceLastCheck.length} new items to post.`);
            for (const entry of newItemsSinceLastCheck) {
                const title = entry.title || "No Title";
                const link = entry.link || "";
                const imageUrl = getImageFromEntry(entry);
                const embedDiscord = new EmbedBuilder()
                    .setTitle(title)
                    .setURL(link)
                    .setColor(0x0099FF);

                if (imageUrl) {
                    embedDiscord.setImage(imageUrl);
                }
                
                if (entry.isoDate) {
                    embedDiscord.setTimestamp(new Date(entry.isoDate));
                }

                try {
                    //Send to Discord channel
                    await channel.send({ embeds: [embedDiscord] });
                    console.log(`Posted '${title}' to Discord.`);
                } catch (discordError) {
                    console.error(`Failed to send message to Discord for '${title}':`, discordError);
                }
                
                //Delay, avoid limited rate issues with Discord API
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            if (latestGuidInCurrentFeed) {
                //Record the latest GUID processed
                await saveLastProcessedGuid(latestGuidInCurrentFeed);
                lastProcessedGuid = latestGuidInCurrentFeed;
            }
        } else {
            console.log("No new RSS items found.");
        }

    } catch (error) {
        console.error(`An unexpected error occurred during RSS check:`, error);
        if (error.response) {
            console.error('RSS Parser Response Error:', error.response.status, error.response.headers, error.response.data);
        }
    }
}

// Initialize the Discord client and set up event listeners
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    await loadLastProcessedGuid();
    if (client.rssCheckInterval) {
        clearInterval(client.rssCheckInterval);
    }
    client.rssCheckInterval = setInterval(checkRssFeed, RSS_CHECK_INTERVAL_MS);
    console.log(`Started RSS feed check loop every ${RSS_CHECK_INTERVAL_MS / 1000} seconds.`);
    checkRssFeed();
});

client.on('error', error => {
    console.error('Discord client encountered an error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN);
} else {
    console.error("Error: DISCORD_BOT_TOKEN environment variable not set. Please set it before running the bot.");
}