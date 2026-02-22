// Builds, registers, and audits slash command definitions for guild/global scope.
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
  const setChannelOptionLimit = 25;
  const setChannelReservedOptionCount = 8;

  // Convert arbitrary track keys into valid slash option names.
  function toSetChannelTrackOptionName(trackKey) {
    const raw = String(trackKey || "").trim().toLowerCase();
    if (!raw) {
      return null;
    }
    const cleaned = raw.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!cleaned) {
      return null;
    }
    const suffix = "_post";
    const maxBaseLength = Math.max(1, 32 - suffix.length);
    return `${cleaned.slice(0, maxBaseLength)}${suffix}`;
  }

  // Add dynamic `/setchannel` options for custom tracks while respecting Discord option limits.
  function buildDynamicSetChannelTrackOptions() {
    const staticTrackKeys = new Set(
      baseSetChannelTrackOptions
        .map((optionDef) => String(optionDef?.trackKey || "").trim())
        .filter(Boolean)
    );
    const usedOptionNames = new Set(
      baseSetChannelTrackOptions
        .flatMap((optionDef) => [optionDef?.optionName, optionDef?.legacyOptionName])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    );
    usedOptionNames.add("track");
    usedOptionNames.add("post_channel");
    usedOptionNames.add("log");
    usedOptionNames.add("application_log");
    usedOptionNames.add("bot_log");
    usedOptionNames.add("accept_message");
    usedOptionNames.add("bug");
    usedOptionNames.add("suggestions");

    const baseTrackOptionCount = baseSetChannelTrackOptions.reduce(
      (count, optionDef) => count + (optionDef?.legacyOptionName ? 2 : 1),
      0
    );
    const maxDynamicCount = Math.max(
      0,
      setChannelOptionLimit - baseTrackOptionCount - setChannelReservedOptionCount
    );
    if (maxDynamicCount === 0) {
      return [];
    }

    const candidates = [];
    for (const trackKey of getApplicationTrackKeys()) {
      const normalizedTrackKey = String(trackKey || "").trim();
      if (!normalizedTrackKey || staticTrackKeys.has(normalizedTrackKey)) {
        continue;
      }

      const optionName = toSetChannelTrackOptionName(normalizedTrackKey);
      if (!optionName || usedOptionNames.has(optionName)) {
        continue;
      }
      usedOptionNames.add(optionName);

      candidates.push({
        trackKey: normalizedTrackKey,
        optionName,
        description: `${getTrackLabel(normalizedTrackKey)} application post channel`,
      });
    }

    return candidates
      .sort((a, b) =>
        getTrackLabel(a.trackKey).localeCompare(getTrackLabel(b.trackKey))
      )
      .slice(0, maxDynamicCount);
  }

  // Central command builder used by both registration and refresh paths.
  function buildSlashCommands() {
    const setChannelTrackOptions = [
      ...baseSetChannelTrackOptions,
      ...buildDynamicSetChannelTrackOptions(),
    ];
    const setChannelCommand = new SlashCommandBuilder()
      .setName("setchannel")
      .setDescription("Set app/application-log/log/bug/suggestions channels");

    for (const optionDef of setChannelTrackOptions) {
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
          .setDescription("Bot operation log channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("application_log")
          .setDescription("Application decision/digest log channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("bot_log")
          .setDescription("Legacy alias for bot operation log channel")
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

    // Both `/reactionrole` and `/rr` share the same subcommand schema.
    function buildReactionRoleCommand(commandName, description) {
      return new SlashCommandBuilder()
        .setName(commandName)
        .setDescription(description)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("create")
            .setDescription("Create or update a reaction-role mapping")
            .addStringOption((option) =>
              option
                .setName("message_id")
                .setDescription("Target message ID")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("emoji")
                .setDescription("Emoji (e.g. ✅ or <:name:id>)")
                .setRequired(true)
            )
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("Role to grant when user reacts")
                .setRequired(true)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Channel containing the target message")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a reaction-role mapping")
            .addStringOption((option) =>
              option
                .setName("message_id")
                .setDescription("Target message ID")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("emoji")
                .setDescription("Emoji used in the mapping")
                .setRequired(true)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Channel containing the target message")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List reaction-role mappings")
            .addStringOption((option) =>
              option
                .setName("message_id")
                .setDescription("Optional message ID filter")
                .setRequired(false)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Optional channel filter")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("button")
            .setDescription("Post a button role panel (click to toggle roles)")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("First role")
                .setRequired(true)
            )
            .addRoleOption((option) =>
              option
                .setName("role_2")
                .setDescription("Second role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_3")
                .setDescription("Third role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_4")
                .setDescription("Fourth role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_5")
                .setDescription("Fifth role")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Panel message text")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("message_type")
                .setDescription("Panel format")
                .addChoices(
                  {
                    name: "Text",
                    value: "text",
                  },
                  {
                    name: "Embed",
                    value: "embed",
                  }
                )
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("title")
                .setDescription("Embed title (for message_type:embed)")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("embed_color")
                .setDescription("Embed hex color (for message_type:embed, e.g. #57F287)")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("color")
                .setDescription("Button color/style")
                .addChoices(
                  {
                    name: "Gray",
                    value: "secondary",
                  },
                  {
                    name: "Blue",
                    value: "primary",
                  },
                  {
                    name: "Green",
                    value: "success",
                  },
                  {
                    name: "Red",
                    value: "danger",
                  }
                )
                .setRequired(false)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Target channel (defaults to current)")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("button_edit")
            .setDescription("Change buttons/color/style on an existing button role panel")
            .addStringOption((option) =>
              option
                .setName("message_id")
                .setDescription("Button panel message ID")
                .setRequired(true)
            )
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("First role (replaces buttons when provided)")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_2")
                .setDescription("Second role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_3")
                .setDescription("Third role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_4")
                .setDescription("Fourth role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_5")
                .setDescription("Fifth role")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("color")
                .setDescription("New button color/style")
                .addChoices(
                  {
                    name: "Gray",
                    value: "secondary",
                  },
                  {
                    name: "Blue",
                    value: "primary",
                  },
                  {
                    name: "Green",
                    value: "success",
                  },
                  {
                    name: "Red",
                    value: "danger",
                  }
                )
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("embed_color")
                .setDescription("New embed hex color (#57F287), or `clear`")
                .setRequired(false)
            )
            .addBooleanOption((option) =>
              option
                .setName("remove_top_text")
                .setDescription("Remove top message content above embed/buttons")
                .setRequired(false)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Channel containing the panel message")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("gui")
            .setDescription("Open button/modal GUI for reaction-role management")
        );
    }

    // `/set` is intentionally grouped to keep mode-specific options scoped in Discord UI.
    function buildSetCommand() {
      return new SlashCommandBuilder()
        .setName("set")
        .setDescription("Set channel/role/template configuration")
        .addSubcommandGroup((group) =>
          group
            .setName("channel")
            .setDescription("Set application/log/feedback channels")
            .addSubcommand((subcommand) =>
              subcommand
                .setName("post")
                .setDescription("Set application post channel for one track")
                .addStringOption((option) =>
                  option
                    .setName("track")
                    .setDescription("Track key/alias")
                    .setAutocomplete(true)
                    .setRequired(true)
                )
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName("channel_post")
                .setDescription("Legacy alias of `post`")
                .addStringOption((option) =>
                  option
                    .setName("track")
                    .setDescription("Track key/alias")
                    .setAutocomplete(true)
                    .setRequired(true)
                )
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName("application_log")
                .setDescription("Set application decision/digest log channel")
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName("log")
                .setDescription("Set bot operation log channel")
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName("accept_message")
                .setDescription("Set accepted-announcement channel")
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName("bug")
                .setDescription("Set bug report channel")
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
            .addSubcommand((subcommand) =>
              subcommand
                .setName("suggestions")
                .setDescription("Set suggestions channel")
                .addChannelOption((option) =>
                  option
                    .setName("channel")
                    .setDescription("Channel to assign")
                    .setRequired(true)
                )
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("default")
            .setDescription("Apply server-level default channel + optional roles/template")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Base channel (defaults to current channel)")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("First default accepted role (optional)")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_2")
                .setDescription("Second default accepted role (optional)")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_3")
                .setDescription("Third default accepted role (optional)")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_4")
                .setDescription("Fourth default accepted role (optional)")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_5")
                .setDescription("Fifth default accepted role (optional)")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Accepted announcement template (optional)")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("approle")
            .setDescription("Set accepted roles for a track")
            .addStringOption((option) =>
              option
                .setName("track")
                .setDescription("Track key/alias")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("First accepted role")
                .setRequired(true)
            )
            .addRoleOption((option) =>
              option
                .setName("role_2")
                .setDescription("Second accepted role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_3")
                .setDescription("Third accepted role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_4")
                .setDescription("Fourth accepted role")
                .setRequired(false)
            )
            .addRoleOption((option) =>
              option
                .setName("role_5")
                .setDescription("Fifth accepted role")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("approlegui")
            .setDescription("Open GUI to set accepted roles for a track")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("denymsg")
            .setDescription("Set denied DM message template")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Denied DM template")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("acceptmsg")
            .setDescription("Set accepted announcement channel/template")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Accepted-announcement channel")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Accepted announcement template")
                .setRequired(false)
            )
        );
    }

    // `/message` and `/msg` intentionally share one definition to avoid drift.
    function buildMessageCommand(commandName = "message", description = "Post or edit bot messages") {
      return new SlashCommandBuilder()
        .setName(commandName)
        .setDescription(description)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("structured")
            .setDescription("Post a structured bot message")
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
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Target channel (defaults to current)")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("embed")
            .setDescription("Post an embedded bot message")
            .addStringOption((option) =>
              option
                .setName("title")
                .setDescription("Embed title")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("description")
                .setDescription("Embed description/body")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("color")
                .setDescription("Optional hex color (e.g. #57F287)")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("footer")
                .setDescription("Optional footer text")
                .setRequired(false)
            )
            .addBooleanOption((option) =>
              option
                .setName("timestamp")
                .setDescription("Include current timestamp on embed")
                .setRequired(false)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Target channel (defaults to current)")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("edit")
            .setDescription("Edit an embedded bot message posted by this bot")
            .addStringOption((option) =>
              option
                .setName("message_id")
                .setDescription("Target bot message ID")
                .setRequired(true)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Target channel (defaults to current)")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("title")
                .setDescription("New embed title")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("description")
                .setDescription("New embed description/body")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("color")
                .setDescription("Hex color (#57F287) or `clear`")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("footer")
                .setDescription("Footer text or `clear`")
                .setRequired(false)
            )
            .addBooleanOption((option) =>
              option
                .setName("timestamp")
                .setDescription("Set timestamp on/off")
                .setRequired(false)
            )
        );
    }

    return [
      new SlashCommandBuilder()
        .setName("accept")
        .setDescription("Accept an application")
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
        )
        .addStringOption((option) =>
          option
            .setName("applicant")
            .setDescription("Optional applicant username/mention/ID override")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Accept mode (`force` accepts even if user is not in server)")
            .addChoices(
              {
                name: "Normal (block if user not in server)",
                value: "normal",
              },
              {
                name: "Force (accept anyway)",
                value: "force",
              }
            )
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
      buildSetCommand(),
      buildMessageCommand("message", "Post or edit bot messages"),
      buildMessageCommand("msg", "Alias of /message"),
      new SlashCommandBuilder()
        .setName("useapprole")
        .setDescription("Legacy alias for accepted-role management")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("manage")
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
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("gui")
            .setDescription("Open GUI to set accepted roles for a track")
        ),
      buildReactionRoleCommand("reactionrole", "Manage reaction-role mappings"),
      buildReactionRoleCommand("rr", "Alias of /reactionrole"),
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
        .setName("unassignedrole")
        .setDescription("List accepted applications that could not get roles (user not in server)")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Maximum rows to show")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("lookup")
        .setDescription("Show all application history for a Discord user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Discord user to look up")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("track")
            .setDescription("Filter by track (optional)")
            .setAutocomplete(true)
            .setRequired(false)
        ),
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
        .setName("repostapps")
        .setDescription("Repost tracked applications in row order")
        .addStringOption((option) =>
          option
            .setName("track")
            .setDescription("Optional track key/alias filter")
            .setAutocomplete(true)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Maximum number of applications to repost")
            .setMinValue(1)
            .setMaxValue(500)
            .setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName("settings")
        .setDescription("Configure bot settings")
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
                .setDescription("Vote numerator")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("denominator")
                .setDescription("Vote denominator")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("minimum_votes")
                .setDescription("Minimum YES/NO votes")
                .setMinValue(1)
                .setMaxValue(200)
                .setRequired(false)
            )
            .addIntegerOption((option) =>
              option
                .setName("deadline_hours")
                .setDescription("Auto-deny deadline in hours (1–720). Set 0 to disable.")
                .setMinValue(0)
                .setMaxValue(720)
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
                .setDescription("Enable/disable reminders")
                .setRequired(false)
            )
            .addNumberOption((option) =>
              option
                .setName("threshold_hours")
                .setDescription("Hours before first reminder")
                .setMinValue(0.25)
                .setMaxValue(720)
                .setRequired(false)
            )
            .addNumberOption((option) =>
              option
                .setName("repeat_hours")
                .setDescription("Reminder repeat hours")
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
                .setDescription("Reviewer mentions/IDs")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("voters")
            .setDescription("Set per-track role filter for vote eligibility")
            .addStringOption((option) =>
              option
                .setName("track")
                .setDescription("Track key/alias")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("roles")
                .setDescription("Role mentions/IDs or `clear`")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("digest")
            .setDescription("Set daily digest behavior")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable/disable digest")
                .setRequired(false)
            )
            .addIntegerOption((option) =>
              option
                .setName("hour_utc")
                .setDescription("UTC digest hour")
                .setMinValue(0)
                .setMaxValue(23)
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("sheets")
            .setDescription("Configure source Google Sheet settings")
            .addStringOption((option) =>
              option
                .setName("spreadsheet_id")
                .setDescription("Spreadsheet ID (`default` clears)")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("sheet_name")
                .setDescription("Sheet name (`default` clears)")
                .setRequired(false)
            )
            .addBooleanOption((option) =>
              option
                .setName("reset")
                .setDescription("Reset sheet overrides")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("missingusermsg")
            .setDescription("Set thread message when accepted applicant is not in server")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("Message text")
                .setMinLength(1)
                .setMaxLength(1900)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("export")
            .setDescription("DM your current settings JSON")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("import")
            .setDescription("Import settings JSON")
            .addStringOption((option) =>
              option
                .setName("json")
                .setDescription("JSON payload")
                .setRequired(true)
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

  // isGuildCommandSetCurrent: handles is guild command set current.
  async function isGuildCommandSetCurrent(rest, guildId, commands) {
    const existing = await rest.get(
      Routes.applicationGuildCommands(config.clientId, guildId)
    );

    // Normalize to avoid false positives from payload ordering/extra transient fields.
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

  // clearGlobalCommands: handles clear global commands.
  async function clearGlobalCommands(rest) {
    const existing = await rest.get(Routes.applicationCommands(config.clientId));
    if (Array.isArray(existing) && existing.length > 0) {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log("Cleared global slash commands to avoid duplicate command entries.");
      return existing.length;
    }
    return 0;
  }

  // confirmGuildCommandSet: handles confirm guild command set.
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

  // Register commands with guild-first strategy so updates appear immediately.
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

  // registerSlashCommandsForGuild: handles register slash commands for guild.
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

  // Resolve best guild target for command registration when DISCORD_GUILD_ID is unset.
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

  // Permission audit is used by debug/config flows to explain channel-level failures quickly.
  async function auditBotPermissions() {
    const channelMap = getActiveChannelMap();
    const configuredEntries = Object.entries(channelMap).filter(([, channelId]) =>
      isSnowflake(channelId)
    );
    if (configuredEntries.length === 0) {
      console.log("Permission audit skipped: no active channel set. Use /set channel.");
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
