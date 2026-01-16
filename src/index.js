require('dotenv').config();
// Discord moderasyon botu - coded by eieNN
const {
  ActionRowBuilder,
  ActivityType,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN .env dosyasında bulunamadı.');
  process.exit(1);
}

const ownerId = process.env.OWNER_ID;
if (!ownerId) {
  console.error('OWNER_ID .env dosyasında bulunamadı. Yalnızca owner komutları için gereklidir.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});

const LOG_CONFIG_PATH = path.join(__dirname, '..', 'data', 'logConfig.json');
const STATUS_CONFIG_PATH = path.join(__dirname, '..', 'data', 'statusConfig.json');
const logChannelTemplates = [
  { key: 'roles', name: 'rol-log', topic: 'Rol oluşturma ve silme kayıtları' },
  { key: 'channels', name: 'kanal-log', topic: 'Kanal oluşturma ve silme kayıtları' },
  { key: 'members', name: 'uye-log', topic: 'Ban/unban/kick kayıtları' },
  { key: 'messages', name: 'mesaj-log', topic: 'Mesaj silme ve düzenleme kayıtları' }
];

const STATUS_CHOICES = [
  { name: 'Oynuyor', value: 'playing', type: ActivityType.Playing },
  { name: 'İzliyor', value: 'watching', type: ActivityType.Watching },
  { name: 'Dinliyor', value: 'listening', type: ActivityType.Listening },
  { name: 'Yarışıyor', value: 'competing', type: ActivityType.Competing }
];

const STATUS_VALUE_MAP = STATUS_CHOICES.reduce((acc, item) => {
  acc[item.value] = item.type;
  return acc;
}, {});

const STATUS_LABEL_MAP = STATUS_CHOICES.reduce((acc, item) => {
  acc[item.value] = item.name;
  return acc;
}, {});

const PANEL_ACTIONS = Object.freeze({
  START: 'owner_start',
  STOP: 'owner_stop',
  RESTART: 'owner_restart'
});

const BAN_GIF_URL = 'https://media.tenor.com/gnXapwOEaTEAAAAM/spongebob-ban.gif';
const UNBAN_GIF_URL = 'https://media.tenor.com/h34KsaiJYSkAAAAM/saul-goodman-unbanned.gif';
const MESSAGE_DELETE_GIF_URL = 'https://media.tenor.com/YB0jjlTs2EIAAAAM/deleted.gif';
const SIGNATURE = 'coded by eieNN';
const FOOTER = { text: SIGNATURE };
const DATE_FORMATTER = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short'
});
const MEMBER_COLORS = Object.freeze({
  ban: 0xff3b30,
  unban: 0x2ecc71,
  kick: 0x99aab5
});
const DEFAULT_STATUS = Object.freeze({ typeKey: 'playing', text: 'Moderasyon aktif' });
const transientDeleteMessageIds = new Set();

let logConfig = loadLogConfig();
let botPaused = false;
let statusConfig = loadStatusConfig();

const slashCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Log kategorisi ve kanallarını oluşturur')
    .addStringOption((option) =>
      option
        .setName('yetkiliid')
        .setDescription('Logları görebilecek rol veya kullanıcı ID\'si')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bir üyeyi sunucudan yasaklar')
    .addUserOption((option) =>
      option.setName('uye').setDescription('Yasaklanacak üye').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('sebep').setDescription('Yasaklama sebebi (opsiyonel)')
    )
    .addIntegerOption((option) =>
      option
        .setName('gecmismesajgunu')
        .setDescription('Kaç günün mesajları silinsin (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('ID üzerinden yasağı kaldırır')
    .addStringOption((option) =>
      option
        .setName('uyeid')
        .setDescription('Yasağı kaldırılacak kullanıcı ID\'si')
        .setRequired(true)
    )
    .addStringOption((option) => option.setName('sebep').setDescription('Sebep (opsiyonel)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulunduğunuz kanalda toplu mesaj siler')
    .addIntegerOption((option) =>
      option
        .setName('adet')
        .setDescription('Silinecek mesaj adedi (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addStringOption((option) => option.setName('sebep').setDescription('Sebep (opsiyonel)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('setstatus')
    .setDescription('Botun "Oynuyor" kısmını günceller (owner)')
    .addStringOption((option) =>
      option
        .setName('tip')
        .setDescription('Discord durum türü')
        .setRequired(true)
        .addChoices(...STATUS_CHOICES.map(({ name, value }) => ({ name, value })))
    )
    .addStringOption((option) =>
      option
        .setName('mesaj')
        .setDescription('Durum metni (ör: Oynuyor: Moderasyon)')
        .setRequired(true)
        .setMaxLength(128)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('ownerpanel')
    .setDescription('Botu başlat/durdur/yeniden başlat paneli (owner)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

const commandData = slashCommands.map((command) => command.toJSON());

client.on('ready', async () => {
  console.log(`Bot ${client.user.tag} olarak giriş yaptı.`);
  await updatePresence();
  await registerSlashCommands();
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handlePanelButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (botPaused && !isOwner(interaction.user.id)) {
      await interaction.reply({ content: 'Bot şu anda durduruldu. Sadece sahibi tekrar başlatabilir.', ephemeral: true });
      return;
    }

    switch (interaction.commandName) {
      case 'setup':
        await handleSetup(interaction);
        break;
      case 'ban':
        await handleBan(interaction);
        break;
      case 'unban':
        await handleUnban(interaction);
        break;
      case 'clear':
        await handleClear(interaction);
        break;
      case 'setstatus':
        await handleSetStatus(interaction);
        break;
      case 'ownerpanel':
        await handleOwnerPanel(interaction);
        break;
      default:
        await interaction.reply({ content: 'Komut tanınmadı.', ephemeral: true });
    }
  } catch (error) {
    console.error('Komut çalışırken hata:', error);
    const content = 'Komut işlenirken bir hata oluştu.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    }
  }
});

client.on('roleCreate', async (role) => {
  if (botPaused) return;
  const entry = await fetchRecentAudit(role.guild, AuditLogEvent.RoleCreate, role.id);
  await sendLog(role.guild, 'roles', {
    title: 'Rol oluşturuldu',
    description: 'Yeni bir rol oluşturuldu.',
    fields: detailFields({
      target: `**${role.name}** (${role.id})`,
      moderator: executorFromEntry(entry)
    })
  });
});

client.on('roleDelete', async (role) => {
  if (botPaused) return;
  const entry = await fetchRecentAudit(role.guild, AuditLogEvent.RoleDelete, role.id);
  await sendLog(role.guild, 'roles', {
    title: 'Rol silindi',
    description: 'Bir rol silindi.',
    fields: detailFields({
      target: `ID: ${role.id}`,
      moderator: executorFromEntry(entry)
    })
  });
});

client.on('channelCreate', async (channel) => {
  if (!channel.guild) return;
  if (botPaused) return;
  const entry = await fetchRecentAudit(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  await sendLog(channel.guild, 'channels', {
    title: 'Kanal oluşturuldu',
    description: 'Yeni bir kanal oluşturuldu.',
    fields: detailFields({
      target: `<#${channel.id}> (${describeChannelType(channel.type)})`,
      moderator: executorFromEntry(entry)
    })
  });
});

client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  if (botPaused) return;
  const entry = await fetchRecentAudit(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  await sendLog(channel.guild, 'channels', {
    title: 'Kanal silindi',
    description: 'Bir kanal silindi.',
    fields: detailFields({
      target: `${channel.name || 'Bilinmeyen'} (${channel.id})`,
      moderator: executorFromEntry(entry)
    })
  });
  clearMissingChannel(channel.guild.id, channel.id);
});

client.on('guildBanAdd', async (ban) => {
  if (botPaused) return;
  const entry = await fetchRecentAudit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  const reason = entry?.reason || 'Belirtilmedi';
  await sendLog(ban.guild, 'members', {
    title: 'Üye yasaklandı',
    description: 'Sunucudan bir kullanıcı yasaklandı.',
    fields: detailFields({
      target: formatUser(ban.user),
      moderator: executorFromEntry(entry),
      reason
    }),
    color: MEMBER_COLORS.ban,
    thumbnail: avatarUrl(ban.user),
    image: BAN_GIF_URL
  });
});

client.on('guildBanRemove', async (ban) => {
  if (botPaused) return;
  const entry = await fetchRecentAudit(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
  const reason = entry?.reason || 'Belirtilmedi';
  await sendLog(ban.guild, 'members', {
    title: 'Üyenin yasağı kaldırıldı',
    description: 'Bir üyenin yasağı kaldırıldı.',
    fields: detailFields({
      target: formatUser(ban.user),
      moderator: executorFromEntry(entry),
      reason
    }),
    color: MEMBER_COLORS.unban,
    thumbnail: avatarUrl(ban.user),
    image: UNBAN_GIF_URL
  });
});

client.on('guildMemberRemove', async (member) => {
  if (botPaused) return;
  const entry = await fetchRecentAudit(member.guild, AuditLogEvent.MemberKick, member.id);
  if (!entry) return;
  const reason = entry.reason || 'Belirtilmedi';
  await sendLog(member.guild, 'members', {
    title: 'Üye atıldı',
    description: 'Sunucudan bir kullanıcı atıldı.',
    fields: detailFields({
      target: formatUser(member.user),
      moderator: executorFromEntry(entry),
      reason
    }),
    color: MEMBER_COLORS.kick,
    thumbnail: avatarUrl(member.user)
  });
});

client.on('messageDelete', async (message) => {
  if (transientDeleteMessageIds.has(message.id)) {
    transientDeleteMessageIds.delete(message.id);
    return;
  }
  if (!message.guild || isLogChannel(message.guild.id, message.channelId)) return;
  if (botPaused) return;
  const content = message.partial ? 'Önbellekte bulunmadı.' : message.content || 'İçerik yok.';
  const executor = await fetchRecentAudit(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
  await sendLog(message.guild, 'messages', {
    title: 'Mesaj silindi',
    description: 'Bir mesaj silindi.',
    fields: detailFields({
      target: formatUser(message.author),
      moderator: executorFromEntry(executor),
      reason: executor?.reason || 'Belirtilmedi',
      extra: [
        { name: 'Kanal', value: `<#${message.channelId}>`, inline: false },
        { name: 'İçerik', value: truncate(content, 1000), inline: false }
      ]
    })
  });
  await sendTransientDeleteNotice(message, content);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || isLogChannel(newMessage.guild.id, newMessage.channelId)) return;
  if (botPaused) return;

  try {
    if (oldMessage.partial) await oldMessage.fetch();
    if (newMessage.partial) await newMessage.fetch();
  } catch (error) {
    console.warn('Mesaj fetch edilirken hata:', error.message);
  }

  if (oldMessage.content === newMessage.content) return;
  await sendLog(newMessage.guild, 'messages', {
    title: 'Mesaj düzenlendi',
    description: 'Bir mesaj düzenlendi.',
    fields: detailFields({
      target: formatUser(newMessage.author),
      extra: [
        { name: 'Kanal', value: `<#${newMessage.channelId}>`, inline: false },
        { name: 'Önce', value: truncate(oldMessage.content || 'Bilgi yok', 500), inline: false },
        { name: 'Sonra', value: truncate(newMessage.content || 'Bilgi yok', 500), inline: false }
      ]
    })
  });
});

async function handleSetup(interaction) {
  const authorityId = interaction.options.getString('yetkiliid');
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('Bu komut sadece sunucularda kullanılabilir.');
    return;
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ];

  let targetType = 'role';
  const role = guild.roles.cache.get(authorityId);
  if (role) {
    overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] });
  } else {
    const member = await guild.members.fetch(authorityId).catch(() => null);
    if (!member) {
      await interaction.editReply('Girilen ID ne bir rol ne de bir üye. Lütfen kontrol edin.');
      return;
    }
    overwrites.push({ id: member.id, allow: [PermissionFlagsBits.ViewChannel] });
    targetType = 'user';
  }

  await cleanupExistingLogs(guild.id);

  const category = await guild.channels.create({
    name: 'eienn-logs',
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites
  });

  const createdChannels = {};
  for (const template of logChannelTemplates) {
    const channel = await guild.channels.create({
      name: template.name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: template.topic
    });
    createdChannels[template.key] = channel.id;
  }

  logConfig[guild.id] = {
    categoryId: category.id,
    channels: createdChannels,
    authorityId,
    authorityType: targetType
  };
  saveLogConfig();

  await interaction.editReply('Log kategorisi ve kanalları hazır.');
}

async function handleBan(interaction) {
  const target = interaction.options.getUser('uye');
  const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
  const deleteDays = interaction.options.getInteger('gecmismesajgunu') || 0;

  if (!interaction.guild || !target) {
    await interaction.reply({ content: 'Komut sadece sunucularda kullanılabilir.', ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'Bu kullanıcı sunucuda değil.', ephemeral: true });
    return;
  }

  if (!member.bannable) {
    await interaction.reply({ content: 'Bu kullanıcıyı yasaklamak için yetkim yok.', ephemeral: true });
    return;
  }

  await notifyMemberBan(member.user, interaction.guild, interaction.user, reason);
  await member.ban({ reason, deleteMessageDays: deleteDays });
  const banFields = detailFields({
    target: formatUser(target),
    moderator: formatUser(interaction.user),
    reason
  });
  const banEmbed = new EmbedBuilder()
    .setTitle('Üye yasaklandı')
    .setDescription('Sunucudan bir kullanıcı yasaklandı.')
    .setColor(MEMBER_COLORS.ban)
    .setImage(BAN_GIF_URL)
    .setThumbnail(avatarUrl(target))
    .setFooter(FOOTER)
    .setTimestamp();
  if (banFields.length) banEmbed.addFields(...banFields);
  await interaction.reply({ embeds: [banEmbed] });
  await sendLog(interaction.guild, 'members', {
    title: 'Slash komutu ile yasaklandı',
    description: 'Slash komutu ile yasaklama işlemi uygulandı.',
    fields: banFields,
    color: MEMBER_COLORS.ban,
    thumbnail: avatarUrl(target),
    image: BAN_GIF_URL
  });
}

async function handleUnban(interaction) {
  const userId = interaction.options.getString('uyeid');
  const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

  if (!interaction.guild) {
    await interaction.reply({ content: 'Komut sadece sunucularda kullanılabilir.', ephemeral: true });
    return;
  }

  const bans = await interaction.guild.bans.fetch();
  const banInfo = bans.get(userId);
  if (!banInfo) {
    await interaction.reply({ content: 'Bu ID için aktif bir yasak bulunamadı.', ephemeral: true });
    return;
  }

  await interaction.guild.bans.remove(userId, reason);
  const unbanFields = detailFields({
    target: formatUser(banInfo.user),
    moderator: formatUser(interaction.user),
    reason
  });
  const unbanEmbed = new EmbedBuilder()
    .setTitle('Yasak kaldırıldı')
    .setDescription('Bir üyenin yasağı kaldırıldı.')
    .setColor(MEMBER_COLORS.unban)
    .setImage(UNBAN_GIF_URL)
    .setThumbnail(avatarUrl(banInfo.user))
    .setFooter(FOOTER)
    .setTimestamp();
  if (unbanFields.length) unbanEmbed.addFields(...unbanFields);
  await interaction.reply({ embeds: [unbanEmbed] });
  await sendLog(interaction.guild, 'members', {
    title: 'Slash komutu ile yasağı kaldırıldı',
    description: 'Slash komutu ile yasağı kaldırma işlemi uygulandı.',
    fields: unbanFields,
    color: MEMBER_COLORS.unban,
    thumbnail: avatarUrl(banInfo.user),
    image: UNBAN_GIF_URL
  });
}

async function handleClear(interaction) {
  const amount = interaction.options.getInteger('adet');
  const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Bu komut yalnızca metin kanallarında kullanılabilir.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const deleted = await channel.bulkDelete(amount, true);
  await interaction.editReply(`${deleted.size} mesaj silindi.`);
  await sendLog(interaction.guild, 'messages', {
    title: 'Slash komutu ile mesajlar silindi',
    description: 'Slash komutu ile toplu mesaj silindi.',
    fields: detailFields({
      target: `<#${channel.id}>`,
      moderator: formatUser(interaction.user),
      reason,
      extra: [{ name: 'Silinen Mesaj', value: `${deleted.size}`, inline: false }]
    })
  });
}

async function handleSetStatus(interaction) {
  if (!ensureOwner(interaction)) return;
  const typeKey = interaction.options.getString('tip');
  const message = interaction.options.getString('mesaj');
  statusConfig = {
    typeKey: STATUS_VALUE_MAP[typeKey] ? typeKey : DEFAULT_STATUS.typeKey,
    text: message
  };
  saveStatusConfig();
  await updatePresence();

  await interaction.reply({
    content: `Durum güncellendi: ${STATUS_LABEL_MAP[typeKey] || 'Belirsiz'} - ${message}`,
    ephemeral: true
  });
}

async function handleOwnerPanel(interaction) {
  if (!ensureOwner(interaction)) return;
  const stateText = botPaused ? 'DURDURULDU' : 'AKTİF';
  await interaction.reply({
    content: `Bot durumu: **${stateText}**`,
    components: [buildPanelRow()],
    ephemeral: true
  });
}

async function handlePanelButton(interaction) {
  if (!Object.values(PANEL_ACTIONS).includes(interaction.customId)) return;
  if (!ensureOwner(interaction)) return;

  await interaction.deferReply({ ephemeral: true });

  if (interaction.customId === PANEL_ACTIONS.START) {
    if (!botPaused) {
      await interaction.editReply('Bot zaten aktif.');
      return;
    }
    botPaused = false;
    await updatePresence();
    await interaction.editReply('Bot başlatıldı.');
    return;
  }

  if (interaction.customId === PANEL_ACTIONS.STOP) {
    if (botPaused) {
      await interaction.editReply('Bot zaten durdurulmuş durumda.');
      return;
    }
    botPaused = true;
    await updatePresence();
    await interaction.editReply('Bot durduruldu.');
    return;
  }

  if (interaction.customId === PANEL_ACTIONS.RESTART) {
    botPaused = false;
    await interaction.editReply('Bot yeniden başlatılıyor...');
    await restartClientConnection();
    await updatePresence();
    await interaction.followUp({ content: 'Bot tekrar çevrimiçi.', ephemeral: true });
  }
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(PANEL_ACTIONS.START).setLabel('Start').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(PANEL_ACTIONS.STOP).setLabel('Stop').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(PANEL_ACTIONS.RESTART).setLabel('Restart').setStyle(ButtonStyle.Primary)
  );
}

function isOwner(userId) {
  return userId === ownerId;
}

function ensureOwner(interaction) {
  if (isOwner(interaction.user.id)) return true;
  const payload = {
    content: 'Bu komutu yalnızca OWNER_ID olarak belirtilen kullanıcı kullanabilir.',
    ephemeral: true
  };
  if (interaction.deferred || interaction.replied) {
    interaction.followUp(payload).catch(() => {});
  } else {
    interaction.reply(payload).catch(() => {});
  }
  return false;
}

async function updatePresence() {
  if (!client.user) return;
  try {
    const activityType = STATUS_VALUE_MAP[statusConfig.typeKey] ?? ActivityType.Playing;
    const activityText = statusConfig.text || DEFAULT_STATUS.text;
    await client.user.setPresence({
      activities: [{ type: activityType, name: activityText }],
      status: botPaused ? 'idle' : 'online'
    });
  } catch (error) {
    console.warn('Presence güncellenemedi:', error.message);
  }
}

async function restartClientConnection() {
  try {
    await client.destroy();
  } catch (error) {
    console.warn('Client kapatılırken hata:', error.message);
  }
  await client.login(token);
}

async function notifyMemberBan(user, guild, moderator, reason) {
  if (!user) return;
  const embed = new EmbedBuilder()
    .setTitle(`${guild?.name || 'Sunucu'} - Yasaklandın`)
    .setDescription(
      `${guild?.name || 'Bu sunucuda'} kuralları ihlal ettiğin için yasaklandın. ` +
      'Detaylar aşağıda yer alıyor.'
    )
    .setColor(MEMBER_COLORS.ban)
    .setImage(BAN_GIF_URL)
    .setThumbnail(avatarUrl(user))
    .setFooter(FOOTER)
    .setTimestamp();
  const dmFields = detailFields({
    target: formatUser(user),
    moderator: formatUser(moderator),
    reason: reason || 'Belirtilmedi',
    extra: [{ name: 'Tarih', value: formatDate(), inline: false }]
  });
  if (dmFields.length) embed.addFields(...dmFields);
  await safeDm(user, embed);
}

async function sendTransientDeleteNotice(message, cachedContent) {
  const channel =
    message.channel && typeof message.channel.send === 'function'
      ? message.channel
      : await client.channels.fetch(message.channelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return;

  const embed = new EmbedBuilder()
    .setTitle('Mesaj silindi')
    .setDescription('Bir mesaj silindi.')
    .setColor(0xffa133)
    .setThumbnail(avatarUrl(message.author))
    .setImage(MESSAGE_DELETE_GIF_URL)
    .setFooter(FOOTER)
    .setTimestamp();

  const noticeFields = detailFields({
    target: formatUser(message.author),
    extra: [
      { name: 'Kanal', value: `<#${message.channelId}>`, inline: false },
      { name: 'İçerik', value: truncate(cachedContent || 'Bilgi yok', 400), inline: false }
    ]
  });
  if (noticeFields.length) {
    embed.addFields(...noticeFields);
  }

  const sent = await channel.send({ embeds: [embed] }).catch(() => null);
  if (!sent) return;

  transientDeleteMessageIds.add(sent.id);

  setTimeout(() => {
    sent.delete().catch(() => {}).finally(() => {
      transientDeleteMessageIds.delete(sent.id);
    });
  }, 5000);
}

async function safeDm(user, embed) {
  try {
    await user.send({ embeds: [embed] });
  } catch (error) {
    console.warn(`DM gönderilemedi (${user?.id || 'bilinmiyor'}):`, error.message);
  }
}

function formatDate(date = new Date()) {
  return DATE_FORMATTER.format(date);
}

async function registerSlashCommands() {
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!clientId || !guildId) {
    console.warn('CLIENT_ID veya GUILD_ID bulunamadı, komutlar kaydedilmeyecek.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
    console.log('Slash komutları kaydedildi.');
  } catch (error) {
    console.error('Komut kaydedilirken hata:', error);
  }
}

function loadLogConfig() {
  try {
    const raw = fs.readFileSync(LOG_CONFIG_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    console.warn('logConfig yüklenemedi, sıfırlanıyor:', error.message);
    return {};
  }
}

function saveLogConfig() {
  fs.writeFileSync(LOG_CONFIG_PATH, JSON.stringify(logConfig, null, 2));
}

function loadStatusConfig() {
  try {
    if (!fs.existsSync(STATUS_CONFIG_PATH)) {
      fs.writeFileSync(STATUS_CONFIG_PATH, JSON.stringify(DEFAULT_STATUS, null, 2));
      return { ...DEFAULT_STATUS };
    }
    const raw = fs.readFileSync(STATUS_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const typeKey = STATUS_VALUE_MAP[parsed.typeKey] ? parsed.typeKey : DEFAULT_STATUS.typeKey;
    const text = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : DEFAULT_STATUS.text;
    const sanitized = { typeKey, text };
    fs.writeFileSync(STATUS_CONFIG_PATH, JSON.stringify(sanitized, null, 2));
    return sanitized;
  } catch (error) {
    console.warn('statusConfig yüklenemedi, varsayılan kullanılacak:', error.message);
    try {
      fs.writeFileSync(STATUS_CONFIG_PATH, JSON.stringify(DEFAULT_STATUS, null, 2));
    } catch (writeError) {
      console.warn('statusConfig yazılamadı:', writeError.message);
    }
    return { ...DEFAULT_STATUS };
  }
}

function saveStatusConfig() {
  try {
    fs.writeFileSync(STATUS_CONFIG_PATH, JSON.stringify(statusConfig, null, 2));
  } catch (error) {
    console.warn('statusConfig kaydedilemedi:', error.message);
  }
}

async function cleanupExistingLogs(guildId) {
  const guildData = logConfig[guildId];
  if (!guildData) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const ids = [guildData.categoryId, ...Object.values(guildData.channels || {})];
  for (const id of ids) {
    if (!id) continue;
    const channel = guild.channels.cache.get(id);
    if (channel) {
      try {
        await channel.delete('Yeni log kurulumu');
      } catch (error) {
        console.warn(`Kanal silinemedi (${id}):`, error.message);
      }
    }
  }
  delete logConfig[guildId];
  saveLogConfig();
}

function isLogChannel(guildId, channelId) {
  const guildData = logConfig[guildId];
  if (!guildData) return false;
  return Object.values(guildData.channels || {}).includes(channelId);
}

function clearMissingChannel(guildId, channelId) {
  const guildData = logConfig[guildId];
  if (!guildData) return;
  for (const [key, value] of Object.entries(guildData.channels)) {
    if (value === channelId) {
      guildData.channels[key] = null;
    }
  }
  saveLogConfig();
}

async function fetchRecentAudit(guild, type, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find((log) => {
      const isRecent = Date.now() - log.createdTimestamp < 10_000;
      const sameTarget = targetId ? log.target?.id === targetId : true;
      return isRecent && sameTarget;
    });
    return entry || null;
  } catch (error) {
    console.warn('Audit log alınamadı:', error.message);
    return null;
  }
}

async function sendLog(guild, key, payload) {
  if (!guild) return;
  const guildData = logConfig[guild.id];
  const channelId = guildData?.channels?.[key];
  if (!channelId) return;

  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    channel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(payload.color || 0x5865f2)
    .setTimestamp();

  if (payload.title) embed.setTitle(payload.title);
  if (payload.description) embed.setDescription(payload.description);
  if (payload.fields?.length) embed.addFields(...payload.fields);
  if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);
  if (payload.image) embed.setImage(payload.image);
  embed.setFooter(payload.footer || FOOTER);

  await channel.send({ embeds: [embed] });
}

function formatUser(user) {
  return user ? `${user.tag} (${user.id})` : 'Bilinmeyen kullanıcı';
}

function truncate(text, maxLength) {
  if (!text) return 'Bilgi yok';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function describeChannelType(type) {
  const entry = Object.entries(ChannelType).find(([, value]) => value === type);
  return entry ? entry[0] : type;
}

function avatarUrl(user) {
  if (!user || typeof user.displayAvatarURL !== 'function') return null;
  return user.displayAvatarURL({ size: 64, extension: 'png', forceStatic: true });
}

function detailFields({ target, moderator, reason, extra = [] }) {
  const fields = [];
  if (target) fields.push({ name: 'Hedef', value: target, inline: true });
  if (moderator) fields.push({ name: 'Yetkili', value: moderator, inline: true });
  if (reason) fields.push({ name: 'Sebep', value: reason, inline: true });
  const normalizedExtra = extra.map((field) =>
    field.inline === undefined ? { ...field, inline: true } : field
  );
  return fields.concat(normalizedExtra);
}

function executorFromEntry(entry) {
  return entry?.executor ? formatUser(entry.executor) : 'Bilinmiyor';
}

client.login(token);

