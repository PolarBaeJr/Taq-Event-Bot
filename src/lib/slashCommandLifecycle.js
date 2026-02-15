function createSlashCommandLifecycle(options = {}) {
  const config = options.config && typeof options.config === "object"
    ? options.config
    : {};
  const client = options.client;
  const REST = options.REST;
  const Routes = options.Routes;
  const SlashCommandBuilder = options.SlashCommandBuilder;
  const baseSetChannelTrackOptions = Array.isArray(options.baseSetChannelTrackOptions)
    ? options.baseSetChannelTrackOptions
    : [];
  const debugModes = options.debugModes || {};
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : () => false;
  const getAnyActiveChannelId = typeof options.getAnyActiveChannelId === "function"
    ? options.getAnyActiveChannelId
    : () => null;
  const getActiveChannelMap = typeof options.getActiveChannelMap === "function"
    ? options.getActiveChannelMap
    : () => ({});
  const getApplicationTrackKeys = typeof options.getApplicationTrackKeys === "function"
    ? options.getApplicationTrackKeys
    : () => [];
  const getTrackLabel = typeof options.getTrackLabel === "function"
    ? options.getTrackLabel
    : (trackKey) => String(trackKey || "");
  const requiredChannelPermissions = Array.isArray(options.requiredChannelPermissions)
    ? options.requiredChannelPermissions
    : [];
  const requiredGuildPermissions = Array.isArray(options.requiredGuildPermissions)
    ? options.requiredGuildPermissions
    : [];

  function buildSlashCommands() {
    const setChannelCommand = new SlashCommandBuilder()
      .setName("setchannel")
      .setDescription("Set app/log/bug/suggestions channels");

    for (const optionDef of baseSetChannelTrackOptions) {
      if (optionDef.legacyOptionName) {
        setChannelCommand.addChannelOption((option) =>
          option
            .setName(optionDef.legacyOptionName)
            .setDescription(optionDef.legacyDescription || `${optionDef.description} (legacy)`)
            .setRequired(false)
        );
      }

      setChannelCommand.addChannelOption((option) =>
        option
          .setName(optionDef.optionName)
          .setDescription(optionDef.description)
          .setRequired(false)
      );
    }

    setChannelCommand
      .addChannelOption((option) =>
        option
          .setName("log")
          .setDescription("Application log channel (defaults to first configured post channel)")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("accept_message")
          .setDescription("Accepted-announcement channel used by /accept")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("bug")
          .setDescription("Bug report channel used by /bug")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("suggestions")
          .setDescription("Suggestion channel used by /suggestions")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("track")
          .setDescription("Track key/label for `post_channel` (supports custom tracks)")
          .setAutocomplete(true)
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("post_channel")
          .setDescription("Application post channel for the selected `track`")
          .setRequired(false)
      );

    return [
      new SlashCommandBuilder()
        .setName("accept")
        .setDescription("Force-accept an application")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Application message ID")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("application_id")
            .setDescription("Application ID (e.g. TESTER-123)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("job_id")
            .setDescription("Application job ID (e.g. job-000123)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Optional reason to store in logs/DM templates")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("deny")
        .setDescription("Force-deny an application")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Application message ID")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("application_id")
            .setDescription("Application ID (e.g. TESTER-123)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("job_id")
            .setDescription("Application job ID (e.g. job-000123)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Optional reason to store in logs/DM templates")
            .setRequired(false)
        ),
      setChannelCommand,
      new SlashCommandBuilder()
        .setName("setapprole")
        .setDescription("Set accepted roles for a track (overwrites previous roles)")
        .addStringOption((option) =>
          option
            .setName("track")
            .setDescription("Application track for these roles")
            .setAutocomplete(true)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("First role to grant on acceptance")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role_2")
            .setDescription("Second role to grant on acceptance")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_3")
            .setDescription("Third role to grant on acceptance")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_4")
            .setDescription("Fourth role to grant on acceptance")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_5")
            .setDescription("Fifth role to grant on acceptance")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("track")
        .setDescription("Manage application tracks")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Create or update a custom track")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("Track label, e.g. Scripter")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("key")
                .setDescription("Optional key, e.g. scripter")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("aliases")
                .setDescription("Optional aliases, comma-separated")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("list").setDescription("List all configured tracks")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("edit")
            .setDescription("Edit an existing custom track")
            .addStringOption((option) =>
              option
                .setName("track")
                .setDescription("Existing custom track key/alias")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("Updated display label")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("aliases")
                .setDescription("Updated aliases, comma-separated")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a custom track")
            .addStringOption((option) =>
              option
                .setName("track")
                .setDescription("Custom track key/alias")
                .setAutocomplete(true)
                .setRequired(true)
            )
        ),
      new SlashCommandBuilder()
        .setName("dashboard")
        .setDescription("Show per-track application status counts and oldest pending age"),
      new SlashCommandBuilder()
        .setName("uptime")
        .setDescription("Show how long the bot process has been running"),
      new SlashCommandBuilder()
        .setName("reopen")
        .setDescription("Reopen a previously accepted/denied application")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Application message ID")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("application_id")
            .setDescription("Application ID (e.g. TESTER-123)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("job_id")
            .setDescription("Application job ID (e.g. job-000123)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Optional reason for reopening")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("settings")
        .setDescription("Configure voting, reminders, reviewers, and daily digest")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("show")
            .setDescription("Show current bot settings")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("vote")
            .setDescription("Set per-track vote threshold/quorum")
            .addStringOption((option) =>
              option
                .setName("track")
                .setDescription("Track key/alias")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("numerator")
                .setDescription("Threshold ratio numerator (e.g. 2 for 2/3)")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("denominator")
                .setDescription("Threshold ratio denominator (e.g. 3 for 2/3)")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("minimum_votes")
                .setDescription("Minimum YES/NO votes required to decide")
                .setMinValue(1)
                .setMaxValue(200)
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("reminders")
            .setDescription("Set stale pending reminder behavior")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable/disable stale reminders")
                .setRequired(false)
            )
            .addNumberOption((option) =>
              option
                .setName("threshold_hours")
                .setDescription("Hours pending before first reminder")
                .setMinValue(0.25)
                .setMaxValue(720)
                .setRequired(false)
            )
            .addNumberOption((option) =>
              option
                .setName("repeat_hours")
                .setDescription("Hours between reminder repeats")
                .setMinValue(0.25)
                .setMaxValue(720)
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("reviewers")
            .setDescription("Set per-track reviewer mentions (users/roles)")
            .addStringOption((option) =>
              option
                .setName("track")
                .setDescription("Track key/alias")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("mentions")
                .setDescription("Comma/space list of @users, @roles, or IDs. Use `clear` to remove.")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("digest")
            .setDescription("Configure daily summary digest to logs channel")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable/disable digest posting")
                .setRequired(false)
            )
            .addIntegerOption((option) =>
              option
                .setName("hour_utc")
                .setDescription("UTC hour for digest post (0-23)")
                .setMinValue(0)
                .setMaxValue(23)
                .setRequired(false)
            )
        ),
      new SlashCommandBuilder()
        .setName("config")
        .setDescription("Export/import bot settings as JSON")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("export")
            .setDescription("DM your current admin settings JSON")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("import")
            .setDescription("Import admin settings from JSON")
            .addStringOption((option) =>
              option
                .setName("json")
                .setDescription("JSON payload (code block accepted)")
                .setRequired(true)
            )
        ),
      new SlashCommandBuilder()
        .setName("setdenymsg")
        .setDescription("Set the DM message sent to users when an application is denied")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Template with placeholders like {track}, {application_id}, {server}")
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName("setacceptmsg")
        .setDescription("Set accepted announcement channel/template")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where accepted announcements should be posted")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Template (e.g. welcome to {track} team...)")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("setaccept")
        .setDescription("Set accepted announcement channel/template")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where accepted announcements should be posted")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Template (e.g. welcome to {track} team...)")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("structuredmsg")
        .setDescription("Post a structured bot message in the current channel")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Message title")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("line_1")
            .setDescription("First content line")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("line_2")
            .setDescription("Second content line")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("line_3")
            .setDescription("Third content line")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("line_4")
            .setDescription("Fourth content line")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("line_5")
            .setDescription("Fifth content line")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("code_block")
            .setDescription("Wrap content lines in a code block")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Send a bug report to the configured bug channel")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Bug details")
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName("suggestions")
        .setDescription("Send a suggestion to the configured suggestions channel")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Suggestion details")
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName("suggestion")
        .setDescription("Alias of /suggestions")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Suggestion details")
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName("debug")
        .setDescription("Run bot integration diagnostics and tests")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Choose which debug action to run")
            .setRequired(true)
            .addChoices(
              { name: "report", value: debugModes.report },
              { name: "post_test", value: debugModes.post_test },
              { name: "accept_test", value: debugModes.accept_test },
              { name: "deny_test", value: debugModes.deny_test }
            )
        )
        .addStringOption((option) =>
          option
            .setName("track")
            .setDescription("Optional track label override for debug tests")
            .setAutocomplete(true)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Application message ID (for accept_test / deny_test)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("job_id")
            .setDescription("Job ID text (real ID targets app; unknown value runs simulation)")
            .setRequired(false)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Required for accept_test/deny_test simulation checks")
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop the bot process"),
      new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Restart the bot process"),
    ].map((command) => command.toJSON());
  }

  async function isGuildCommandSetCurrent(rest, guildId, commands) {
    const existing = await rest.get(
      Routes.applicationGuildCommands(config.clientId, guildId)
    );

    const normalizeCommand = (command) => ({
      name: command.name || "",
      description: command.description || "",
      type: command.type || 1,
      options: Array.isArray(command.options) ? command.options : [],
      default_member_permissions: command.default_member_permissions || null,
      dm_permission:
        typeof command.dm_permission === "boolean" ? command.dm_permission : null,
      nsfw: typeof command.nsfw === "boolean" ? command.nsfw : false,
    });

    const normalizeSet = (items) =>
      items
        .map(normalizeCommand)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => JSON.stringify(item))
        .join("\n");

    return normalizeSet(existing) === normalizeSet(commands);
  }

  async function clearGlobalCommands(rest) {
    const existing = await rest.get(Routes.applicationCommands(config.clientId));
    if (Array.isArray(existing) && existing.length > 0) {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log("Cleared global slash commands to avoid duplicate command entries.");
      return existing.length;
    }
    return 0;
  }

  async function confirmGuildCommandSet(rest, guildId, commands) {
    const existing = await rest.get(
      Routes.applicationGuildCommands(config.clientId, guildId)
    );
    const existingNames = new Set(existing.map((cmd) => cmd.name));
    const desiredNames = new Set(commands.map((cmd) => cmd.name));

    if (existingNames.size !== desiredNames.size) {
      throw new Error(
        `Guild ${guildId} command set mismatch after sync. Expected ${desiredNames.size}, got ${existingNames.size}.`
      );
    }
    for (const name of desiredNames) {
      if (!existingNames.has(name)) {
        throw new Error(`Guild ${guildId} missing expected command: ${name}`);
      }
    }
  }

  async function registerSlashCommands() {
    const commands = buildSlashCommands();
    const rest = new REST({ version: "10" }).setToken(config.botToken);

    const guildId = await resolveGuildIdForCommands();
    if (guildId) {
      await registerSlashCommandsForGuild(rest, guildId, commands);
      const removed = await clearGlobalCommands(rest);
      await confirmGuildCommandSet(rest, guildId, commands);
      console.log(
        `Command scope confirmed for guild ${guildId}. Global commands removed: ${removed}.`
      );
      return;
    }

    const guildIds = [...client.guilds.cache.keys()];
    if (guildIds.length > 0) {
      for (const id of guildIds) {
        await registerSlashCommandsForGuild(rest, id, commands);
        await confirmGuildCommandSet(rest, id, commands);
      }
      const removed = await clearGlobalCommands(rest);
      console.log(
        `Command scope confirmed for ${guildIds.length} guild(s). Global commands removed: ${removed}.`
      );
      return;
    }

    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log("Registered global slash commands (may take time to appear)");
  }

  async function registerSlashCommandsForGuild(rest, guildId, commands) {
    if (await isGuildCommandSetCurrent(rest, guildId, commands)) {
      console.log(`Slash commands already up to date in guild ${guildId}`);
      return;
    }

    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), {
      body: commands,
    });
    console.log(`Registered slash commands in guild ${guildId}`);
  }

  async function resolveGuildIdForCommands() {
    if (isSnowflake(config.guildId)) {
      return config.guildId;
    }

    const activeChannelId = getAnyActiveChannelId();
    if (!activeChannelId) {
      return null;
    }

    try {
      const channel = await client.channels.fetch(activeChannelId);
      if (!channel || !("guildId" in channel) || !channel.guildId) {
        return null;
      }
      return channel.guildId;
    } catch (err) {
      console.error("Failed deriving guild from channel:", err.message);
      return null;
    }
  }

  async function auditBotPermissions() {
    const channelMap = getActiveChannelMap();
    const configuredEntries = Object.entries(channelMap).filter(([, channelId]) =>
      isSnowflake(channelId)
    );
    if (configuredEntries.length === 0) {
      console.log("Permission audit skipped: no active channel set. Use /setchannel.");
      return;
    }

    const issues = [];
    for (const [trackKey, channelId] of configuredEntries) {
      const trackLabel = getTrackLabel(trackKey);
      let channel = null;
      try {
        channel = await client.channels.fetch(channelId);
      } catch (err) {
        issues.push(`${trackLabel}: failed to fetch channel ${channelId} (${err.message})`);
        continue;
      }

      if (!channel || !("guild" in channel) || !channel.guild) {
        issues.push(`${trackLabel}: channel ${channelId} is not a guild text channel.`);
        continue;
      }

      const guild = channel.guild;
      const me = await guild.members.fetchMe();
      const missingGuildPerms = requiredGuildPermissions.filter(
        ([, perm]) => !me.permissions.has(perm)
      ).map(([name]) => name);
      const channelPerms = channel.permissionsFor(me);
      const missingChannelPerms = requiredChannelPermissions.filter(
        ([, perm]) => !channelPerms || !channelPerms.has(perm)
      ).map(([name]) => name);

      if (missingGuildPerms.length > 0) {
        issues.push(`${trackLabel}: missing guild perms: ${missingGuildPerms.join(", ")}`);
      }
      if (missingChannelPerms.length > 0) {
        issues.push(
          `${trackLabel}: missing channel perms in <#${channelId}>: ${missingChannelPerms.join(", ")}`
        );
      }
    }

    if (issues.length === 0) {
      console.log(`Permission audit passed for ${configuredEntries.length} channel(s).`);
      return;
    }

    for (const issue of issues) {
      console.error(issue);
    }
    throw new Error("Permission audit failed. Grant missing permissions and check overrides.");
  }

  return {
    buildSlashCommands,
    isGuildCommandSetCurrent,
    clearGlobalCommands,
    confirmGuildCommandSet,
    registerSlashCommands,
    registerSlashCommandsForGuild,
    resolveGuildIdForCommands,
    auditBotPermissions,
  };
}

module.exports = {
  createSlashCommandLifecycle,
};
