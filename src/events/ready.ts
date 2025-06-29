import { Client } from "discord.js";
import { loadLastProcessedGuid } from "@/utils/fileUtils";
import {
  checkRssFeed,
  setLastProcessedGuid,
} from "@/services/discordRssPoster";
import { RSS_CHECK_INTERVAL_MS } from "@/config";

export default async function onReady(client: Client) {
  console.log(`Logged in as ${client.user?.tag}!`);
  const lastGuid = await loadLastProcessedGuid();
  setLastProcessedGuid(lastGuid);

  const checkFeed = async () => {
    await checkRssFeed(client);
    setTimeout(checkFeed, RSS_CHECK_INTERVAL_MS);
  };

  checkFeed();

  console.log(
    `Started RSS feed check loop every ${formatDuration(RSS_CHECK_INTERVAL_MS)} .`
  );
}

function formatDuration(ms:number) {
  const seconds = Math.floor(ms / 1000);
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hrs > 0) parts.push(`${hrs} hours`);
    if (mins > 0) parts.push(`${mins} minutes`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} seconds`);

    return parts.join(" ");
}
