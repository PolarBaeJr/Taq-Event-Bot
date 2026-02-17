function createDebugAndFeedbackUtils(options = {}) {
  const client = options.client;
  const config = options.config && typeof options.config === "object"
    ? options.config
    : {};
  const REST = options.REST;
  const Routes = options.Routes;
  const getActiveChannelMap = typeof options.getActiveChannelMap === "function"
    ? options.getActiveChannelMap
    : () => ({});
  const getActiveApprovedRoleMap = typeof options.getActiveApprovedRoleMap === "function"
    ? options.getActiveApprovedRoleMap
    : () => ({});
  const getApplicationTrackKeys = typeof options.getApplicationTrackKeys === "function"
    ? options.getApplicationTrackKeys
    : () => [];
  const getTrackLabel = typeof options.getTrackLabel === "function"
    ? options.getTrackLabel
    : (trackKey) => String(trackKey || "");
  const getActiveAcceptAnnounceChannelId =
    typeof options.getActiveAcceptAnnounceChannelId === "function"
      ? options.getActiveAcceptAnnounceChannelId
      : () => null;
  const getActiveLogsChannelId = typeof options.getActiveLogsChannelId === "function"
    ? options.getActiveLogsChannelId
    : () => null;
  const getActiveBotLogsChannelId = typeof options.getActiveBotLogsChannelId === "function"
    ? options.getActiveBotLogsChannelId
    : () => getActiveLogsChannelId();
  const getActiveBugChannelId = typeof options.getActiveBugChannelId === "function"
    ? options.getActiveBugChannelId
    : () => null;
  const getActiveSuggestionsChannelId =
    typeof options.getActiveSuggestionsChannelId === "function"
      ? options.getActiveSuggestionsChannelId
      : () => null;
  const hasAnyActivePostChannelConfigured =
    typeof options.hasAnyActivePostChannelConfigured === "function"
      ? options.hasAnyActivePostChannelConfigured
      : () => false;
  const getStateFilePath = typeof options.getStateFilePath === "function"
    ? options.getStateFilePath
    : () => null;
  const requiredChannelPermissions = Array.isArray(options.requiredChannelPermissions)
    ? options.requiredChannelPermissions
    : [];
  const normalizeTrackKey = typeof options.normalizeTrackKey === "function"
    ? options.normalizeTrackKey
    : () => null;
  const getTrackKeyForChannelId = typeof options.getTrackKeyForChannelId === "function"
    ? options.getTrackKeyForChannelId
    : () => null;
  const getActiveChannelId = typeof options.getActiveChannelId === "function"
    ? options.getActiveChannelId
    : () => null;
  const sendChannelMessage = typeof options.sendChannelMessage === "function"
    ? options.sendChannelMessage
    : async () => null;
  const makeApplicationPostContent =
    typeof options.makeApplicationPostContent === "function"
      ? options.makeApplicationPostContent
      : ({ trackKey }) =>
        [
          "📥 **New Application**",
          `🧭 **Track:** ${String(trackKey || "")}`,
          "",
          "**Name:** Debug Applicant",
          "**Reason:** Debug post test fallback payload",
        ].join("\n");
  const buildFeedbackMessagePayload =
    typeof options.buildFeedbackMessagePayload === "function"
      ? options.buildFeedbackMessagePayload
      : ({
        kind,
        commandLabel,
        reporterUserId,
        sourceChannelId,
        message,
      }) => {
        const isBug = String(kind || "").toLowerCase().includes("bug");
        return {
          embeds: [
            {
              title: isBug ? "🐞 Bug Report" : "💡 Suggestion",
              color: isBug ? 0xdb4437 : 0x0f9d58,
              description:
                String(message || "").length <= 3800
                  ? String(message || "")
                  : `${String(message || "").slice(0, 3780)}\n...[truncated]`,
              fields: [
                {
                  name: "From",
                  value: `<@${reporterUserId}>`,
                  inline: true,
                },
                {
                  name: "Source Channel",
                  value: `<#${sourceChannelId}>`,
                  inline: true,
                },
              ],
              footer: {
                text: `${commandLabel || "Feedback"} via slash command`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
          allowedMentions: { parse: [] },
        };
      };
  const addReaction = typeof options.addReaction === "function"
    ? options.addReaction
    : async () => {};
  const createThread = typeof options.createThread === "function"
    ? options.createThread
    : async () => null;
  const acceptEmoji = String(options.acceptEmoji || "✅");
  const denyEmoji = String(options.denyEmoji || "❌");
  const makeMessageUrl = typeof options.makeMessageUrl === "function"
    ? options.makeMessageUrl
    : () => null;
  const isSnowflake = typeof options.isSnowflake === "function"
    ? options.isSnowflake
    : () => false;
  const grantApprovedRoleOnAcceptance =
    typeof options.grantApprovedRoleOnAcceptance === "function"
      ? options.grantApprovedRoleOnAcceptance
      : async () => ({});
  const sendDeniedApplicationDm = typeof options.sendDeniedApplicationDm === "function"
    ? options.sendDeniedApplicationDm
    : async () => ({});
  const resolveMessageIdForCommand =
    typeof options.resolveMessageIdForCommand === "function"
      ? options.resolveMessageIdForCommand
      : () => null;
  const statusAccepted = String(options.statusAccepted || "accepted");
  const statusDenied = String(options.statusDenied || "denied");
  const statusPending = String(options.statusPending || "pending");
  const getTrackApplicationIdPrefix =
    typeof options.getTrackApplicationIdPrefix === "function"
      ? options.getTrackApplicationIdPrefix
      : () => "APP";
  const finalizeApplication = typeof options.finalizeApplication === "function"
    ? options.finalizeApplication
    : async () => ({ ok: false });
  const readState = typeof options.readState === "function"
    ? options.readState
    : () => ({ applications: {}, settings: {} });
  const getApplicationDisplayId = typeof options.getApplicationDisplayId === "function"
    ? options.getApplicationDisplayId
    : () => "Unknown";

  async function buildDebugReport(interaction) {
    const lines = [];
    const state = readState();
    const activeChannelMap = getActiveChannelMap();
    const activeApprovedRoleMap = getActiveApprovedRoleMap();
    const postJobs = Array.isArray(state.postJobs) ? state.postJobs : [];

    lines.push(`Bot User ID: ${client.user?.id || "unknown"}`);
    lines.push(`Configured Client ID: ${config.clientId || "missing"}`);
    lines.push(
      `Client ID matches bot user ID: ${client.user?.id === config.clientId ? "yes" : "no"}`
    );
    lines.push(`Interaction Guild ID: ${interaction.guildId || "none"}`);
    lines.push(
      `Auto Track Registration From Form: ${
        config.autoRegisterTracksFromForm === true ? "enabled" : "disabled"
      }`
    );
    lines.push(`State File Path: ${getStateFilePath() || config.stateFile || "unknown"}`);
    lines.push(
      `Posting Enabled (channel configured): ${
        hasAnyActivePostChannelConfigured() ? "yes" : "no"
      }`
    );
    lines.push(
      `Tracked Applications: ${
        state.applications && typeof state.applications === "object"
          ? Object.keys(state.applications).length
          : 0
      }`
    );
    lines.push(
      `Tracked Threads: ${
        state.threads && typeof state.threads === "object"
          ? Object.keys(state.threads).length
          : 0
      }`
    );
    lines.push(`Last Processed Sheet Row: ${Number.isInteger(state.lastRow) ? state.lastRow : 0}`);
    const stateSheetSource =
      state.settings?.sheetSource && typeof state.settings.sheetSource === "object"
        ? state.settings.sheetSource
        : {};
    const spreadsheetIdFromState =
      typeof stateSheetSource.spreadsheetId === "string" && stateSheetSource.spreadsheetId.trim()
        ? stateSheetSource.spreadsheetId.trim()
        : null;
    const sheetNameFromState =
      typeof stateSheetSource.sheetName === "string" && stateSheetSource.sheetName.trim()
        ? stateSheetSource.sheetName.trim()
        : null;
    lines.push(
      `Source Spreadsheet ID: ${(spreadsheetIdFromState || config.spreadsheetId || "missing")} (${spreadsheetIdFromState ? "state" : "env"})`
    );
    lines.push(
      `Source Sheet Name: ${(sheetNameFromState || config.sheetName || "missing")} (${sheetNameFromState ? "state" : "env"})`
    );
    for (const trackKey of getApplicationTrackKeys()) {
      const trackLabel = getTrackLabel(trackKey);
      const approvedRoles = Array.isArray(activeApprovedRoleMap[trackKey])
        ? activeApprovedRoleMap[trackKey]
        : [];
      lines.push(
        `Track ${trackLabel}: channel=${activeChannelMap[trackKey] || "none"}, approvedRoles=${
          approvedRoles.length > 0 ? approvedRoles.join(",") : "none"
        }`
      );
    }
    lines.push(
      `Denied DM Template Configured: ${
        typeof state.settings?.denyDmTemplate === "string" &&
        state.settings.denyDmTemplate.trim()
          ? "state"
          : typeof config.denyDmTemplate === "string" && config.denyDmTemplate.trim()
            ? "env"
            : "default"
      }`
    );
    lines.push(`Accept Announcement Channel ID: ${getActiveAcceptAnnounceChannelId() || "none"}`);
    lines.push(`Application Logs Channel ID: ${getActiveLogsChannelId() || "none"}`);
    lines.push(`Logs Channel ID: ${getActiveBotLogsChannelId() || "none"}`);
    lines.push(`Bug Channel ID: ${getActiveBugChannelId() || "none"}`);
    lines.push(`Suggestions Channel ID: ${getActiveSuggestionsChannelId() || "none"}`);
    lines.push(
      `Accept Announcement Template Configured: ${
        typeof state.settings?.acceptAnnounceTemplate === "string" &&
        state.settings.acceptAnnounceTemplate.trim()
          ? "state"
          : typeof config.acceptAnnounceTemplate === "string" &&
              config.acceptAnnounceTemplate.trim()
            ? "env"
            : "default"
      }`
    );
    lines.push(`Queued Post Jobs: ${postJobs.length}`);
    if (!hasAnyActivePostChannelConfigured()) {
      lines.push("Posting Pause Reason: no active application post channels configured.");
    }
    if (postJobs.length > 0) {
      const queuePreview = postJobs.slice(0, 3);
      for (const [index, job] of queuePreview.entries()) {
        const trackKeys = Array.isArray(job?.trackKeys)
          ? job.trackKeys.filter(Boolean)
          : job?.trackKey
            ? [job.trackKey]
            : [];
        const trackSummary = trackKeys.length > 0 ? trackKeys.join(",") : "unknown";
        const attempts = Number.isInteger(job?.attempts) ? job.attempts : 0;
        const rowIndex = Number.isInteger(job?.rowIndex) ? job.rowIndex : "unknown";
        const createdAt = typeof job?.createdAt === "string" ? job.createdAt : "unknown";
        const lastAttemptAt =
          typeof job?.lastAttemptAt === "string" ? job.lastAttemptAt : "none";
        const lastError = String(job?.lastError || "").trim();
        lines.push(
          `Queue[${index}] job=${job?.jobId || "unknown"} row=${rowIndex} track=${trackSummary} attempts=${attempts} createdAt=${createdAt} lastAttemptAt=${lastAttemptAt}`
        );
        if (lastError) {
          lines.push(`Queue[${index}] lastError=${lastError.slice(0, 240)}`);
        }
      }
      if (postJobs.length > queuePreview.length) {
        lines.push(`Queue additional jobs: ${postJobs.length - queuePreview.length}`);
      }
    }

    const rest = new REST({ version: "10" }).setToken(config.botToken);
    try {
      const globals = await rest.get(Routes.applicationCommands(config.clientId));
      lines.push(`Global Commands: ${Array.isArray(globals) ? globals.length : 0}`);
    } catch (err) {
      lines.push(`Global Commands: error (${err.message})`);
    }

    if (interaction.guildId) {
      try {
        const guildCommands = await rest.get(
          Routes.applicationGuildCommands(config.clientId, interaction.guildId)
        );
        const names = Array.isArray(guildCommands)
          ? guildCommands.map((c) => c.name).sort().join(", ")
          : "";
        lines.push(
          `Guild Commands (${interaction.guildId}): ${
            Array.isArray(guildCommands) ? guildCommands.length : 0
          }`
        );
        if (names) {
          lines.push(`Guild Command Names: ${names}`);
        }
      } catch (err) {
        lines.push(`Guild Commands: error (${err.message})`);
      }
    }

    for (const trackKey of getApplicationTrackKeys()) {
      const channelId = activeChannelMap[trackKey];
      if (!channelId) {
        continue;
      }
      const trackLabel = getTrackLabel(trackKey);
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && "guild" in channel && channel.guild) {
          const me = await channel.guild.members.fetchMe();
          const channelPerms = channel.permissionsFor(me);
          const missing = requiredChannelPermissions.filter(
            ([, perm]) => !channelPerms || !channelPerms.has(perm)
          ).map(([name]) => name);
          lines.push(
            `${trackLabel} Missing Channel Perms: ${
              missing.length > 0 ? missing.join(", ") : "none"
            }`
          );
        } else {
          lines.push(`${trackLabel} Channel Check: not a guild text channel`);
        }
      } catch (err) {
        lines.push(`${trackLabel} Channel Check: error (${err.message})`);
      }
    }

    return lines.join("\n");
  }

  async function runDebugPostTest(interaction) {
    const requestedTrack = normalizeTrackKey(interaction.options.getString("track"));
    const currentChatIsGuildText =
      interaction.inGuild() && interaction.channel?.type === options.channelTypeGuildText;
    const mappedTrackFromChat = getTrackKeyForChannelId(interaction.channelId || "");

    const selectedTrack = mappedTrackFromChat || requestedTrack;
    if (!selectedTrack) {
      throw new Error("No track specified.");
    }
    let targetChannelId = null;
    let channelSourceLabel = "";

    if (currentChatIsGuildText) {
      targetChannelId = interaction.channelId;
      channelSourceLabel = "current_chat";
    } else {
      targetChannelId = getActiveChannelId(selectedTrack);
      channelSourceLabel = "configured_track_channel";
    }

    if (!targetChannelId) {
      const trackLabel = getTrackLabel(selectedTrack);
      throw new Error(
        `No active channel configured for ${trackLabel}. Run /set mode:channel first.`
      );
    }
    const trackLabel = getTrackLabel(selectedTrack);

    const triggeredAt = new Date().toISOString();
    const debugHeaders = [
      "Name",
      "Discord Name",
      "Reason",
      "Debug Triggered By",
      "Debug Triggered At",
      "Debug Channel Source",
    ];
    const debugRow = [
      "Debug Applicant",
      "debug-user",
      "Validate direct bot post flow end-to-end",
      `<@${interaction.user.id}>`,
      triggeredAt,
      channelSourceLabel === "current_chat" ? "Current Chat" : "Configured Track Channel",
    ];
    const debugApplicationId = `${trackLabel.replace(/[^A-Za-z0-9]+/g, "").toUpperCase() || "TRACK"}-DEBUG`;
    const payload = makeApplicationPostContent({
      applicationId: debugApplicationId,
      trackKey: selectedTrack,
      applicantMention: `<@${interaction.user.id}>`,
      applicantRawValue: null,
      headers: debugHeaders,
      row: debugRow,
    });

    const msg = await sendChannelMessage(targetChannelId, payload, {
      parse: [],
      users: [interaction.user.id],
    });
    const postedChannelId = msg.channelId || targetChannelId;

    const warnings = [];

    try {
      await addReaction(postedChannelId, msg.id, acceptEmoji);
      await addReaction(postedChannelId, msg.id, denyEmoji);
    } catch (err) {
      warnings.push(`Reaction setup failed: ${err.message}`);
    }

    let threadId = null;
    try {
      const thread = await createThread(postedChannelId, msg.id, "Debug Application Test");
      threadId = thread.id || null;
      if (threadId) {
        const threadChannel = await client.channels.fetch(threadId);
        if (threadChannel && threadChannel.isTextBased()) {
          await threadChannel.send({
            content:
              "This is a debug discussion thread test. No application state was changed.",
            allowedMentions: { parse: [] },
          });
        }
      }
    } catch (err) {
      warnings.push(`Thread creation failed: ${err.message}`);
    }

    let guildId = interaction.guildId || null;
    if (!guildId) {
      const channel = await client.channels.fetch(postedChannelId);
      if (channel && "guildId" in channel && channel.guildId) {
        guildId = channel.guildId;
      }
    }

    return {
      trackKey: selectedTrack,
      trackLabel,
      channelId: postedChannelId,
      messageId: msg.id,
      threadId,
      messageUrl: guildId
        ? makeMessageUrl(guildId, postedChannelId, msg.id)
        : null,
      threadUrl: guildId && threadId ? makeMessageUrl(guildId, threadId, threadId) : null,
      warnings,
    };
  }

  function formatDecisionLabel(decision) {
    return decision === statusAccepted ? "ACCEPTED" : "DENIED";
  }

  async function relayFeedbackCommand({
    interaction,
    commandLabel,
    heading,
    channelId,
    emptyChannelMessage,
  }) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Run this command inside a server channel.",
        ephemeral: true,
      });
      return;
    }

    if (!isSnowflake(channelId)) {
      await interaction.reply({
        content: emptyChannelMessage,
        ephemeral: true,
      });
      return;
    }

    const message = interaction.options.getString("message", true).trim();
    if (!message) {
      await interaction.reply({
        content: "Please provide a non-empty message.",
        ephemeral: true,
      });
      return;
    }

    let targetChannel = null;
    try {
      targetChannel = await client.channels.fetch(channelId);
    } catch {
      targetChannel = null;
    }

    if (!targetChannel || !targetChannel.isTextBased()) {
      await interaction.reply({
        content: `The configured ${commandLabel} channel is invalid. Run /set mode:channel to fix it.`,
        ephemeral: true,
      });
      return;
    }

    const payload = buildFeedbackMessagePayload({
      kind: commandLabel,
      commandLabel,
      reporterUserId: interaction.user.id,
      sourceChannelId: interaction.channelId,
      message,
    });

    const postedMessage = await targetChannel.send({
      ...payload,
      allowedMentions: payload.allowedMentions || { parse: [] },
    });

    let threadId = null;
    let threadWarning = null;
    try {
      const thread = await createThread(
        postedMessage.channelId,
        postedMessage.id,
        `${commandLabel} - ${message}`
      );
      threadId = thread?.id || null;
    } catch (err) {
      threadWarning = `Could not create thread: ${err.message}`;
    }

    const lines = [`Posted in <#${postedMessage.channelId}>.`];
    if (interaction.guildId) {
      lines.push(makeMessageUrl(interaction.guildId, postedMessage.channelId, postedMessage.id));
      if (threadId) {
        lines.push(makeMessageUrl(interaction.guildId, threadId, threadId));
      }
    }
    if (!interaction.guildId && threadId) {
      lines.push(`Thread ID: ${threadId}`);
    }
    if (threadWarning) {
      lines.push(threadWarning);
    }

    await interaction.reply({
      content: lines.join("\n"),
      ephemeral: true,
    });
  }

  async function runDebugRoleAssignmentSimulation({
    trackKey,
    channelId,
    userId,
    applicationId,
    jobId,
  }) {
    if (!isSnowflake(userId)) {
      return {
        outcome: "warning",
        message: "Role test warning: invalid debug user id.",
        roleResult: null,
      };
    }
    if (!isSnowflake(channelId)) {
      return {
        outcome: "warning",
        message:
          "Role test warning: no valid guild channel context available. Run the command in a server text channel or configure /set mode:channel.",
        roleResult: null,
      };
    }

    const simulatedApplication = {
      trackKey,
      channelId,
      applicantUserId: userId,
      applicantName: `Debug User ${userId}`,
      applicationId,
      messageId: null,
      jobId: String(jobId || "").trim() || null,
    };
    const roleResult = await grantApprovedRoleOnAcceptance(simulatedApplication);
    const okStatuses = new Set(["granted", "already_has_role", "granted_partial"]);
    const isOk = okStatuses.has(String(roleResult?.status || ""));

    return {
      outcome: isOk ? "works" : "warning",
      message: isOk
        ? `Role test works: ${roleResult?.message || "role assignment succeeded."}`
        : `Role test warning: ${roleResult?.message || "role assignment did not succeed."}`,
      roleResult,
    };
  }

  async function runDebugDeniedDmSimulation({
    trackKey,
    channelId,
    userId,
    applicationId,
    jobId,
  }) {
    if (!isSnowflake(userId)) {
      return {
        outcome: "warning",
        message: "Denied DM test warning: invalid debug user id.",
        dmResult: null,
      };
    }

    const simulatedApplication = {
      trackKey,
      channelId: isSnowflake(channelId) ? channelId : null,
      applicantUserId: userId,
      applicantName: `Debug User ${userId}`,
      applicationId,
      messageId: null,
      jobId: String(jobId || "").trim() || null,
      decisionSource: "debug_simulation",
      decidedAt: new Date().toISOString(),
    };
    const dmResult = await sendDeniedApplicationDm(
      simulatedApplication,
      "Debug deny simulation."
    );
    const isOk = String(dmResult?.status || "") === "sent";

    return {
      outcome: isOk ? "works" : "warning",
      message: isOk
        ? `Denied DM test works: ${dmResult?.message || "DM sent successfully."}`
        : `Denied DM test warning: ${dmResult?.message || "DM send did not succeed."}`,
      dmResult,
    };
  }

  async function runDebugDecisionTest(interaction, decision) {
    const suppliedJobId = interaction.options.getString("job_id");
    const messageId = resolveMessageIdForCommand(interaction);
    if (!messageId) {
      if (suppliedJobId) {
        const selectedTrack =
          getTrackKeyForChannelId(interaction.channelId || "") ||
          normalizeTrackKey(interaction.options.getString("track"));
        const normalizedJobId = String(suppliedJobId).trim();
        if (!selectedTrack) {
          return {
            ok: false,
            simulated: true,
            decision,
            jobId: normalizedJobId,
            error: "No track specified.",
          };
        }
        const selectedTrackLabel = getTrackLabel(selectedTrack);
        const derivedApplicationId =
          normalizedJobId || `${getTrackApplicationIdPrefix(selectedTrack)}-SIMULATED`;
        const fallbackChannelId =
          (interaction.inGuild() && isSnowflake(interaction.channelId)
            ? interaction.channelId
            : null) || getActiveChannelId(selectedTrack);
        const targetUser = interaction.options.getUser("user");
        const sideEffects = [
          `Simulation only: \`${normalizedJobId}\` is not a tracked application job ID in this chat context.`,
        ];

        if (!targetUser) {
          return {
            ok: false,
            simulated: true,
            decision,
            jobId: normalizedJobId,
            trackLabel: selectedTrackLabel,
            channelId: fallbackChannelId || null,
            error:
              decision === statusAccepted
                ? "For `/debug mode:accept_test` simulation, provide `user` to test role assignment."
                : "For `/debug mode:deny_test` simulation, provide `user` to test denied DM delivery.",
          };
        }

        if (decision === statusAccepted) {
          const roleTest = await runDebugRoleAssignmentSimulation({
            trackKey: selectedTrack,
            channelId: fallbackChannelId,
            userId: targetUser.id,
            applicationId: derivedApplicationId,
            jobId: normalizedJobId,
          });
          sideEffects.push(`Role Test User: <@${targetUser.id}>`);
          sideEffects.push(roleTest.message);
        } else {
          const deniedDmTest = await runDebugDeniedDmSimulation({
            trackKey: selectedTrack,
            channelId: fallbackChannelId,
            userId: targetUser.id,
            applicationId: derivedApplicationId,
            jobId: normalizedJobId,
          });
          sideEffects.push(`Denied DM Test User: <@${targetUser.id}>`);
          sideEffects.push(deniedDmTest.message);
        }
        sideEffects.push("No application state was changed.");

        return {
          ok: true,
          simulated: true,
          decision,
          messageId: null,
          applicationId: derivedApplicationId,
          jobId: normalizedJobId,
          trackLabel: selectedTrackLabel,
          channelId: fallbackChannelId || null,
          messageUrl: null,
          priorStatus: statusPending,
          currentStatus: decision,
          decidedAt: new Date().toISOString(),
          sideEffects,
        };
      }
      return {
        ok: false,
        decision,
        error: suppliedJobId
          ? "That `job_id` was not found, or it maps to multiple track posts in this context."
          : "Message ID not found. Use this command in an application thread or pass `message_id`/`job_id`.",
      };
    }

    const stateBefore = readState();
    const applicationBefore = stateBefore.applications?.[messageId];
    if (!applicationBefore) {
      return {
        ok: false,
        decision,
        messageId,
        error: "This message ID is not a tracked application.",
      };
    }

    let finalizeResult = null;
    try {
      finalizeResult = await finalizeApplication(
        messageId,
        decision,
        "debug_command",
        interaction.user.id
      );
    } catch (err) {
      return {
        ok: false,
        decision,
        messageId,
        jobId: applicationBefore.jobId || null,
        trackLabel: getTrackLabel(applicationBefore.trackKey),
        priorStatus: applicationBefore.status || statusPending,
        error: `Decision attempt failed: ${err.message}`,
      };
    }

    const stateAfter = readState();
    const applicationAfter = stateAfter.applications?.[messageId] || applicationBefore;

    const priorStatus = applicationBefore.status || statusPending;
    const currentStatus = applicationAfter.status || priorStatus;
    const trackLabel = getTrackLabel(applicationAfter.trackKey);
    const channelId = applicationAfter.channelId || null;
    const jobId = applicationAfter.jobId || null;
    const applicationId = getApplicationDisplayId(applicationAfter, messageId);

    let messageUrl = null;
    let guildId = interaction.guildId || null;
    if (!guildId && channelId) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && "guildId" in channel && channel.guildId) {
          guildId = channel.guildId;
        }
      } catch {
        // ignore URL resolution failure
      }
    }
    if (guildId && channelId) {
      messageUrl = makeMessageUrl(guildId, channelId, messageId);
    }

    const sideEffects = [];
    if (decision === statusAccepted) {
      sideEffects.push(
        `Approved Role Action: ${
          applicationAfter.approvedRoleResult?.message || "No approved-role action recorded."
        }`
      );
      sideEffects.push(
        `Acceptance Announcement Action: ${
          applicationAfter.acceptAnnounceResult?.message ||
          "No acceptance-announcement action recorded."
        }`
      );
    } else {
      sideEffects.push(
        `Denied DM Action: ${
          applicationAfter.denyDmResult?.message || "No denied-DM action recorded."
        }`
      );
    }

    if (!finalizeResult?.ok) {
      const reason =
        finalizeResult?.reason === "already_decided"
          ? `Already decided as ${String(finalizeResult?.status || currentStatus).toUpperCase()}.`
          : finalizeResult?.reason === "unknown_application"
            ? "This message ID is not a tracked application."
            : "Decision was not applied.";

      return {
        ok: false,
        decision,
        messageId,
        applicationId,
        jobId,
        trackLabel,
        channelId,
        messageUrl,
        priorStatus,
        currentStatus,
        error: reason,
        sideEffects,
      };
    }

    return {
      ok: true,
      decision,
      messageId,
      applicationId,
      jobId,
      trackLabel,
      channelId,
      messageUrl,
      priorStatus,
      currentStatus,
      decidedAt: applicationAfter.decidedAt || null,
      sideEffects,
    };
  }

  return {
    buildDebugReport,
    runDebugPostTest,
    formatDecisionLabel,
    relayFeedbackCommand,
    runDebugDecisionTest,
  };
}

module.exports = {
  createDebugAndFeedbackUtils,
};
