// ============================
//  Discord Party Bot (Deno)
// ============================

import {
  Client,
  GatewayIntentBits,
  Partials,
  ButtonStyle,
  ComponentType,
  Routes,
  REST,
} from "npm:discord.js";

// ======= ENV VARIABLES ======
const TOKEN = Deno.env.get("TOKEN");
const CATEGORY_ID = Deno.env.get("CATEGORY_ID");

// ======= CLIENT SETUP =======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// party_data = { hostId : { channelId, messageId, originChannel } }
let party_data = {};


// =====================================
//   Handle Interaction (JOIN BUTTON)
// =====================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, hostId] = interaction.customId.split(":");

  if (action !== "join") return;

  let data = party_data[hostId];
  if (!data) {
    return interaction.reply({ content: "❌ This party has ended!", ephemeral: true });
  }

  let channel = interaction.guild.channels.cache.get(data.channelId);
  if (!channel) {
    return interaction.reply({ content: "❌ Party channel no longer exists!", ephemeral: true });
  }

  await channel.permissionOverwrites.edit(interaction.user.id, {
    ViewChannel: true,
    SendMessages: true
  });

  return interaction.reply({
    content: `✅ You have been added to ${channel}`,
    ephemeral: true
  });
});


// =====================================
//             COMMAND: !party
// =====================================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!party")) return;

  let host = msg.author;
  let guild = msg.guild;

  let category = guild.channels.cache.get(CATEGORY_ID);
  if (!category) return msg.reply("❌ CATEGORY_ID is invalid!");

  if (party_data[host.id]) return msg.reply("❌ You already have an active party.");

  // Create channel
  let channel = await guild.channels.create({
    name: `party-${host.username}`,
    type: 0, // text
    parent: CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: ["ViewChannel"]
      },
      {
        id: host.id,
        allow: ["ViewChannel", "SendMessages"]
      }
    ]
  });

  // Create embed message with button
  const embed = {
    title: "🎉 Party Open!",
    description: `**Host:** <@${host.id}>\nClick JOIN to enter the private room.`,
    color: 0x5865f2
  };

  const joinButton = {
    type: ComponentType.Button,
    customId: `join:${host.id}`,
    label: "JOIN",
    style: ButtonStyle.Primary
  };

  let sent = await msg.channel.send({
    embeds: [embed],
    components: [{ type: 1, components: [joinButton] }]
  });

  // Save party data
  party_data[host.id] = {
    channelId: channel.id,
    messageId: sent.id,
    originChannel: msg.channel.id
  };

  msg.reply(`🎉 Party created by <@${host.id}>: ${channel}`);
});


// =====================================
//         COMMAND: !endparty
// =====================================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!endparty")) return;

  let host = msg.author;
  let data = party_data[host.id];

  if (!data) return msg.reply("❌ You do not have an active party.");

  let guild = msg.guild;

  // Delete channel
  let channel = guild.channels.cache.get(data.channelId);
  if (channel) await channel.delete().catch(() => {});

  // Delete JOIN message
  try {
    let origin = guild.channels.cache.get(data.originChannel);
    let joinMsg = await origin.messages.fetch(data.messageId);
    await joinMsg.delete();
  } catch (_) {}

  delete party_data[host.id];

  msg.reply(`✅ ${host.username}, your party has been closed.`);
});


// =====================================
//       Auto End Party When Host Leaves
// =====================================
client.on("guildMemberRemove", async (member) => {
  let data = party_data[member.id];
  if (!data) return;

  let guild = member.guild;

  let channel = guild.channels.cache.get(data.channelId);
  if (channel) await channel.delete().catch(() => {});

  try {
    let origin = guild.channels.cache.get(data.originChannel);
    let joinMsg = await origin.messages.fetch(data.messageId);
    joinMsg.delete();
  } catch (_) {}

  delete party_data[member.id];
});


// =====================================
//              READY EVENT
// =====================================
client.on("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.login(TOKEN);
