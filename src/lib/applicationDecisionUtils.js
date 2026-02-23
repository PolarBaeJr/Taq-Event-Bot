/*
  Core module for application decision utils.
*/

function createApplicationDecisionUtils(options = {}) {
  const client = options.client;
  const ensureLogsChannel =
    typeof options.ensureLogsChannel === "function"
      ? options.ensureLogsChannel
      : async () => null;
  const statusAccepted = String(options.statusAccepted || "accepted");
  const normalizeTrackKey =
    typeof options.normalizeTrackKey === "function"
      ? options.normalizeTrackKey
      : (trackKey) => String(trackKey || "");
  const defaultTrackKey = String(options.defaultTrackKey || "tester");
  const getTrackLabel =
    typeof options.getTrackLabel === "function"
      ? options.getTrackLabel
      : (trackKey) => String(trackKey || "");
  const makeMessageUrl =
    typeof options.makeMessageUrl === "function"
      ? options.makeMessageUrl
      : () => null;
  const getApplicationDisplayId =
    typeof options.getApplicationDisplayId === "function"
      ? options.getApplicationDisplayId
      : () => "Unknown";
  const getActiveApprovedRoleIds =
    typeof options.getActiveApprovedRoleIds === "function"
      ? options.getActiveApprovedRoleIds
      : () => [];
  const PermissionsBitField = options.PermissionsBitField;
  const manageRolesPermission = PermissionsBitField?.Flags?.ManageRoles;
  const getActiveDenyDmTemplate =
    typeof options.getActiveDenyDmTemplate === "function"
      ? options.getActiveDenyDmTemplate
      : () => "";
  const applyTemplatePlaceholders =
    typeof options.applyTemplatePlaceholders === "function"
      ? options.applyTemplatePlaceholders
      : (template) => String(template || "");
  const defaultDenyDmTemplate = String(
    options.defaultDenyDmTemplate || "Your application has been denied."
  );
  const sendDebugDm =
    typeof options.sendDebugDm === "function" ? options.sendDebugDm : async () => {};
  const getActiveAcceptAnnounceChannelId =
    typeof options.getActiveAcceptAnnounceChannelId === "function"
      ? options.getActiveAcceptAnnounceChannelId
      : () => null;
  const getActiveAcceptAnnounceTemplate =
    typeof options.getActiveAcceptAnnounceTemplate === "function"
      ? options.getActiveAcceptAnnounceTemplate
      : () => "";
  const defaultAcceptAnnounceTemplate = String(
    options.defaultAcceptAnnounceTemplate ||
      "Congratulations {user}, your {track} application has been accepted!"
  );
  const sendChannelMessage =
    typeof options.sendChannelMessage === "function"
      ? options.sendChannelMessage
      : async () => {};
  const applicationLogAcceptColor = Number.isInteger(options.applicationLogAcceptColor)
    ? options.applicationLogAcceptColor
    : 0x57f287;
  const applicationLogDenyColor = Number.isInteger(options.applicationLogDenyColor)
    ? options.applicationLogDenyColor
    : 0xed4245;
  const defaultApplicantMissingDiscordThreadNoticeMessage = String(
    options.defaultApplicantMissingDiscordThreadNoticeMessage ||
      "user not in discord please dm"
  );
  const getApplicantMissingDiscordThreadNoticeMessage =
    typeof options.getApplicantMissingDiscordThreadNoticeMessage === "function"
      ? options.getApplicantMissingDiscordThreadNoticeMessage
      : () => defaultApplicantMissingDiscordThreadNoticeMessage;

  // trimEmbedValue: handles trim embed value.
  function trimEmbedValue(value, maxLength = 1024, fallback = "n/a") {
    const text = String(value ?? "").trim();
    if (!text) {
      return fallback;
    }
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 20))}\n...[truncated]`;
  }

  // isSnowflake: handles is snowflake.
  function isSnowflake(value) {
    return /^\d{17,20}$/.test(String(value || "").trim());
  }

  // normalizeRoleIdList: handles normalize role id list.
  function normalizeRoleIdList(value) {
    const source = Array.isArray(value) ? value : [value];
    const out = [];
    const seen = new Set();
    for (const item of source) {
      const roleId = String(item || "").trim();
      if (!isSnowflake(roleId) || seen.has(roleId)) {
        continue;
      }
      seen.add(roleId);
      out.push(roleId);
    }
    return out;
  }

  // normalizeResolverHints: handles normalize resolver hints.
  function normalizeResolverHints(value) {
    const source = Array.isArray(value) ? value : [value];
    const out = [];
    const seen = new Set();
    for (const item of source) {
      const hint = String(item || "").trim();
      if (!hint) {
        continue;
      }
      const key = hint.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(hint);
    }
    return out;
  }

  // parseSubmittedFieldLine: handles parse submitted field line.
  function parseSubmittedFieldLine(rawLine) {
    const line = String(rawLine || "").trim();
    if (!line) {
      return null;
    }

    const match = line.match(/^\*{0,2}\s*([^:]+?)\s*\*{0,2}\s*:\s*(.+)$/);
    if (!match) {
      return null;
    }

    const key = String(match[1] || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const value = String(match[2] || "").trim();
    if (!key || !value) {
      return null;
    }
    return { key, value };
  }

  // extractSubmittedFieldValue: handles extract submitted field value.
  function extractSubmittedFieldValue(submittedFields, hintSets) {
    if (!Array.isArray(submittedFields)) {
      return "";
    }

    const normalizedHintSets = (Array.isArray(hintSets) ? hintSets : [])
      .map((set) => (Array.isArray(set) ? set : [set]))
      .map((set) =>
        set
          .map((token) => String(token || "").trim().toLowerCase())
          .filter(Boolean)
      )
      .filter((set) => set.length > 0);
    if (normalizedHintSets.length === 0) {
      return "";
    }

    for (const rawLine of submittedFields) {
      const parsed = parseSubmittedFieldLine(rawLine);
      if (!parsed) {
        continue;
      }

      for (const hintSet of normalizedHintSets) {
        if (hintSet.every((token) => parsed.key.includes(token))) {
          return parsed.value;
        }
      }
    }

    return "";
  }

  // inferApplicantDiscordValueFromSubmittedFields: handles infer applicant discord value from submitted fields.
  function inferApplicantDiscordValueFromSubmittedFields(application) {
    const submittedFields = Array.isArray(application?.submittedFields)
      ? application.submittedFields
      : [];
    if (submittedFields.length === 0) {
      return "";
    }

    const discordId = extractSubmittedFieldValue(submittedFields, [
      ["discord", "id"],
      ["user", "id"],
      ["member", "id"],
    ]);
    if (discordId) {
      return discordId;
    }

    const discordUsername = extractSubmittedFieldValue(submittedFields, [
      ["discord", "user", "name"],
      ["discord", "username"],
      ["discord", "name"],
      ["discord"],
    ]);
    if (discordUsername) {
      return discordUsername;
    }

    return "";
  }

  // extractDiscordUserId: handles extract discord user id.
  function extractDiscordUserId(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    const mentionMatch = raw.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch) {
      return mentionMatch[1];
    }

    const snowflakeMatch = raw.match(/\b(\d{17,20})\b/);
    if (snowflakeMatch) {
      return snowflakeMatch[1];
    }

    return null;
  }

  // normalizeDiscordLookupQuery: handles normalize discord lookup query.
  function normalizeDiscordLookupQuery(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    const withoutAt = raw.replace(/^@/, "").trim();
    if (!withoutAt) {
      return null;
    }

    const hashIndex = withoutAt.indexOf("#");
    if (hashIndex > 0) {
      const suffix = withoutAt.slice(hashIndex + 1).trim();
      if (/^\d{1,6}$/.test(suffix)) {
        const base = withoutAt.slice(0, hashIndex).trim();
        return base || null;
      }
    }

    return withoutAt;
  }

  // pickBestGuildMemberMatch: handles pick best guild member match.
  function pickBestGuildMemberMatch(members, query) {
    if (!members || typeof members.find !== "function") {
      return null;
    }

    const needle = String(query || "").trim().toLowerCase();
    if (!needle) {
      return typeof members.first === "function" ? members.first() || null : null;
    }

    const exact =
      members.find((member) => member.user.username.toLowerCase() === needle) ||
      members.find((member) => (member.user.globalName || "").toLowerCase() === needle) ||
      members.find((member) => (member.displayName || "").toLowerCase() === needle);
    if (exact) {
      return exact;
    }

    const startsWith =
      members.find((member) => member.user.username.toLowerCase().startsWith(needle)) ||
      members.find((member) =>
        (member.user.globalName || "").toLowerCase().startsWith(needle)
      ) ||
      members.find((member) => (member.displayName || "").toLowerCase().startsWith(needle));
    if (startsWith) {
      return startsWith;
    }

    return null;
  }

  // resolveApplicantUserIdFromApplication: handles resolve applicant user id from application.
  async function resolveApplicantUserIdFromApplication(
    application,
    guild,
    resolverHints = []
  ) {
    if (!application || !guild) {
      return null;
    }

    // Resolver hints (e.g. from a modal prompt) take priority over any cached ID.
    // This lets a reviewer override a wrong cached applicantUserId by providing the
    // correct @mention or numeric ID when the bot fails to find the member.
    const normalizedHints = normalizeResolverHints(resolverHints);
    for (const hint of normalizedHints) {
      const directId = extractDiscordUserId(hint);
      if (isSnowflake(directId)) {
        return directId;
      }
    }

    // Fall back to the previously cached user ID if no explicit hint was given.
    const existing = String(application.applicantUserId || "").trim();
    if (isSnowflake(existing)) {
      return existing;
    }

    const candidateValues = normalizeResolverHints([
      ...normalizedHints,
      inferApplicantDiscordValueFromSubmittedFields(application),
    ]);
    if (candidateValues.length === 0) {
      return null;
    }

    for (const rawCandidate of candidateValues) {
      const directId = extractDiscordUserId(rawCandidate);
      if (isSnowflake(directId)) {
        return directId;
      }

      const query = normalizeDiscordLookupQuery(rawCandidate);
      if (!query) {
        continue;
      }

      const queryCandidates = Array.from(new Set([query, query.toLowerCase()]));
      for (const candidate of queryCandidates) {
        try {
          const matches = await guild.members.fetch({ query: candidate, limit: 10 });
          if (!matches || matches.size === 0) {
            continue;
          }
          const chosen = pickBestGuildMemberMatch(matches, query);
          if (chosen?.id) {
            return chosen.id;
          }
          if (matches.size === 1) {
            const only = matches.first();
            if (only?.id) {
              return only.id;
            }
          }
        } catch {
          // keep trying next candidate and cache fallback
        }
      }

      // Cache fallback: check all currently-loaded members including globalName/displayName.
      // Validate the hit by fetching from API to confirm they're still in the server
      // (cache can contain stale entries for members who have left).
      const cached = pickBestGuildMemberMatch(guild.members?.cache, query);
      if (cached?.id) {
        try {
          const validated = await guild.members.fetch(cached.id);
          if (validated?.id) {
            return validated.id;
          }
        } catch {
          // stale cache entry — keep trying other candidates
        }
      }
    }

    return null;
  }

  // postApplicantNotInDiscordThreadNotice: handles post applicant not in discord thread notice.
  async function postApplicantNotInDiscordThreadNotice(application) {
    if (!application?.threadId) {
      return false;
    }

    const noticeMessage =
      String(getApplicantMissingDiscordThreadNoticeMessage() || "").trim() ||
      defaultApplicantMissingDiscordThreadNoticeMessage;

    try {
      const thread = await client.channels.fetch(application.threadId);
      if (!thread || !thread.isTextBased()) {
        return false;
      }
      if (
        "archived" in thread &&
        thread.archived &&
        typeof thread.setArchived === "function"
      ) {
        try {
          await thread.setArchived(false, "Posting applicant not-in-server notice");
        } catch {
          // continue and attempt send
        }
      }
      await thread.send({
        content: noticeMessage,
        allowedMentions: { parse: [] },
      });
      return true;
    } catch {
      return false;
    }
  }

  // postClosureLog: handles post closure log.
  async function postClosureLog(application) {
    try {
      const channel = await client.channels.fetch(application.channelId);
      if (!channel || !("guild" in channel) || !channel.guild) {
        return;
      }

      const logsChannel = await ensureLogsChannel(channel.guild);
      if (!logsChannel || !logsChannel.isTextBased()) {
        return;
      }

      const decisionLabel =
        application.status === statusAccepted ? "ACCEPTED" : "DENIED";
      const trackKey = normalizeTrackKey(application.trackKey) || defaultTrackKey;
      const trackLabel = getTrackLabel(trackKey);
      const submittedLines =
        Array.isArray(application.submittedFields) &&
        application.submittedFields.length > 0
          ? application.submittedFields.join("\n")
          : "_No answered fields stored_";
      const messageLink = makeMessageUrl(
        channel.guild.id,
        application.channelId,
        application.messageId
      );
      const threadLink = application.threadId
        ? makeMessageUrl(channel.guild.id, application.threadId, application.threadId)
        : "_No thread_";
      const approvedRoleNote =
        application.approvedRoleResult && application.status === statusAccepted
          ? application.approvedRoleResult.message
          : "No role action recorded.";
      const acceptAnnounceNote =
        application.acceptAnnounceResult && application.status === statusAccepted
          ? application.acceptAnnounceResult.message
          : "No acceptance announcement action recorded.";
      const deniedDmNote =
        application.denyDmResult && application.status !== statusAccepted
          ? application.denyDmResult.message
          : "No denied-DM action recorded.";
      const embed = {
        title: "📚 Application Closed (History Log)",
        color:
          application.status === statusAccepted
            ? applicationLogAcceptColor
            : applicationLogDenyColor,
        fields: [
          {
            name: "Decision",
            value: trimEmbedValue(decisionLabel),
            inline: true,
          },
          {
            name: "Track",
            value: trimEmbedValue(trackLabel),
            inline: true,
          },
          {
            name: "Applicant",
            value: trimEmbedValue(application.applicantName || "Unknown"),
            inline: true,
          },
          {
            name: "Row",
            value: trimEmbedValue(application.rowIndex || "Unknown"),
            inline: true,
          },
          {
            name: "Application ID",
            value: trimEmbedValue(getApplicationDisplayId(application)),
            inline: true,
          },
          {
            name: "Decision Source",
            value: trimEmbedValue(application.decisionSource || "Unknown"),
            inline: true,
          },
          {
            name: "Decided By",
            value: trimEmbedValue(
              application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"
            ),
            inline: false,
          },
          {
            name: "Decision Reason",
            value: trimEmbedValue(application.decisionReason || "None provided."),
            inline: false,
          },
          {
            name: "Approved Role Action",
            value: trimEmbedValue(approvedRoleNote),
            inline: false,
          },
          {
            name: "Acceptance Announcement Action",
            value: trimEmbedValue(acceptAnnounceNote),
            inline: false,
          },
          {
            name: "Denied DM Action",
            value: trimEmbedValue(deniedDmNote),
            inline: false,
          },
          {
            name: "Application Message",
            value: trimEmbedValue(messageLink),
            inline: false,
          },
          {
            name: "Discussion Thread",
            value: trimEmbedValue(threadLink),
            inline: false,
          },
          {
            name: "Submitted Fields",
            value: trimEmbedValue(submittedLines, 1024, "_No answered fields stored_"),
            inline: false,
          },
        ],
        timestamp: application.decidedAt || new Date().toISOString(),
      };

      await logsChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (err) {
      console.error("Failed posting closure log:", err.message);
    }
  }

  // grantApprovedRoleOnAcceptance: handles grant approved role on acceptance.
  async function grantApprovedRoleOnAcceptance(application, behavior = {}) {
    const postMissingMemberThreadNotice =
      behavior?.postMissingMemberThreadNotice === true;
    const resolverHints = normalizeResolverHints(behavior?.resolverHints);
    const trackKey = normalizeTrackKey(application.trackKey) || defaultTrackKey;
    const trackLabel = getTrackLabel(trackKey);
    const approvedRoleIds = getActiveApprovedRoleIds(trackKey);
    if (approvedRoleIds.length === 0) {
      return {
        status: "skipped_no_role_configured",
        message: `No approved roles configured for ${trackLabel}.`,
        roleIds: [],
        userId: application.applicantUserId || null,
      };
    }

    try {
      const channel = await client.channels.fetch(application.channelId);
      if (!channel || !("guild" in channel) || !channel.guild) {
        return {
          status: "failed_no_guild",
          message: "Could not resolve guild for role assignment.",
          roleIds: approvedRoleIds,
          userId: application.applicantUserId,
        };
      }

      const guild = channel.guild;
      const me = await guild.members.fetchMe();
      if (!manageRolesPermission || !me.permissions.has(manageRolesPermission)) {
        return {
          status: "failed_missing_permission",
          message: "Bot is missing Manage Roles permission.",
          roleIds: approvedRoleIds,
          userId: application.applicantUserId,
        };
      }

      const resolvedApplicantUserId = await resolveApplicantUserIdFromApplication(
        application,
        guild,
        resolverHints
      );
      if (resolvedApplicantUserId) {
        application.applicantUserId = resolvedApplicantUserId;
      }
      if (!resolvedApplicantUserId) {
        return {
          status: "failed_user_not_resolved",
          message:
            "No applicant Discord user could be resolved from the form data/submitted fields.",
          roleIds: approvedRoleIds,
          userId: null,
        };
      }

      let member = null;
      let memberDefinitelyAbsent = false;
      try {
        member = await guild.members.fetch(resolvedApplicantUserId);
      } catch (fetchErr) {
        // Discord API error 10007 = Unknown Member — user is definitively not in the server.
        // Any other error code (429 rate-limit, 500 server error, network timeout) is
        // transient; fall back to cache rather than falsely blocking acceptance.
        if (fetchErr?.code === 10007) {
          memberDefinitelyAbsent = true;
        } else {
          member = guild.members.cache.get(resolvedApplicantUserId) || null;
          if (!member) {
            // One more attempt: force-refresh this specific member via REST
            try {
              member = await guild.members.fetch({ user: resolvedApplicantUserId, force: true });
            } catch (retryErr) {
              memberDefinitelyAbsent = retryErr?.code === 10007;
              member = null;
            }
          }
        }
      }

      if (!member) {
        if (memberDefinitelyAbsent) {
          let noticePosted = false;
          if (postMissingMemberThreadNotice) {
            noticePosted = await postApplicantNotInDiscordThreadNotice(application);
          }
          return {
            status: "failed_member_not_found",
            message: `Applicant user <@${resolvedApplicantUserId}> is not in this server.${noticePosted ? " Posted configured not-in-server notice in the application thread." : ""}`,
            roleIds: approvedRoleIds,
            userId: resolvedApplicantUserId,
          };
        }
        // Transient Discord API error — could not confirm or deny membership.
        // Return a retriable error rather than falsely blocking acceptance.
        return {
          status: "failed_member_fetch_transient",
          message: `Could not verify guild membership for <@${resolvedApplicantUserId}> due to a Discord API error. Please try accepting again.`,
          roleIds: approvedRoleIds,
          userId: resolvedApplicantUserId,
        };
      }

      const grantedRoleIds = [];
      const alreadyHasRoleIds = [];
      const failedRoleEntries = [];

      for (const roleId of approvedRoleIds) {
        let role = null;
        try {
          role = await guild.roles.fetch(roleId);
        } catch (err) {
          failedRoleEntries.push({
            roleId,
            reason: `fetch failed (${err.message})`,
          });
          continue;
        }

        if (!role) {
          failedRoleEntries.push({
            roleId,
            reason: "role not found in guild",
          });
          continue;
        }

        if (role.managed) {
          failedRoleEntries.push({
            roleId,
            reason: "managed/integration role",
          });
          continue;
        }

        if (me.roles.highest.comparePositionTo(role) <= 0) {
          failedRoleEntries.push({
            roleId,
            reason: "bot role hierarchy is too low",
          });
          continue;
        }

        if (member.roles.cache.has(roleId)) {
          alreadyHasRoleIds.push(roleId);
          continue;
        }

        try {
          await member.roles.add(
            roleId,
            `Application accepted (${getApplicationDisplayId(application)})`
          );
          grantedRoleIds.push(roleId);
        } catch (err) {
          failedRoleEntries.push({
            roleId,
            reason: `add failed (${err.message})`,
          });
        }
      }

      const summaryParts = [];
      if (grantedRoleIds.length > 0) {
        summaryParts.push(
          `granted: ${grantedRoleIds.map((id) => `<@&${id}>`).join(", ")}`
        );
      }
      if (alreadyHasRoleIds.length > 0) {
        summaryParts.push(
          `already had: ${alreadyHasRoleIds.map((id) => `<@&${id}>`).join(", ")}`
        );
      }
      if (failedRoleEntries.length > 0) {
        summaryParts.push(
          `failed: ${failedRoleEntries
            .map((entry) => `<@&${entry.roleId}> (${entry.reason})`)
            .join(", ")}`
        );
      }

      let status = "failed_all";
      if (grantedRoleIds.length > 0 && failedRoleEntries.length === 0) {
        status = "granted";
      } else if (grantedRoleIds.length > 0 && failedRoleEntries.length > 0) {
        status = "granted_partial";
      } else if (alreadyHasRoleIds.length > 0 && failedRoleEntries.length === 0) {
        status = "already_has_role";
      }

      return {
        status,
        message:
          summaryParts.length > 0
            ? `Role assignment for <@${member.id}>: ${summaryParts.join(" | ")}`
            : `No role changes were made for <@${member.id}>.`,
        roleIds: approvedRoleIds,
        grantedRoleIds,
        alreadyHasRoleIds,
        failedRoleEntries,
        userId: member.id,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Role assignment failed: ${err.message}`,
        roleIds: approvedRoleIds,
        userId: isSnowflake(application.applicantUserId)
          ? application.applicantUserId
          : null,
      };
    }
  }

  // revertApprovedRolesOnReopen: handles revert approved roles on reopen.
  async function revertApprovedRolesOnReopen(application, actorId) {
    const grantedRoleIds = normalizeRoleIdList(application?.approvedRoleResult?.grantedRoleIds);
    if (grantedRoleIds.length === 0) {
      return {
        status: "skipped_no_granted_roles",
        message: "No previously granted roles to revert.",
        roleIds: [],
        userId: isSnowflake(application?.applicantUserId) ? application.applicantUserId : null,
      };
    }

    const userId = isSnowflake(application?.approvedRoleResult?.userId)
      ? application.approvedRoleResult.userId
      : isSnowflake(application?.applicantUserId)
        ? application.applicantUserId
        : null;
    if (!userId) {
      return {
        status: "skipped_no_user",
        message: "No applicant Discord user could be resolved for role revert.",
        roleIds: grantedRoleIds,
        userId: null,
      };
    }

    try {
      const channel = await client.channels.fetch(application.channelId);
      if (!channel || !("guild" in channel) || !channel.guild) {
        return {
          status: "failed_no_guild",
          message: "Could not resolve guild for role revert.",
          roleIds: grantedRoleIds,
          userId,
        };
      }

      const guild = channel.guild;
      const me = await guild.members.fetchMe();
      if (!manageRolesPermission || !me.permissions.has(manageRolesPermission)) {
        return {
          status: "failed_missing_permission",
          message: "Bot is missing Manage Roles permission for role revert.",
          roleIds: grantedRoleIds,
          userId,
        };
      }

      let member = null;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        member = null;
      }
      if (!member) {
        return {
          status: "failed_member_not_found",
          message: `Applicant user <@${userId}> is not in this server; could not revert granted roles.`,
          roleIds: grantedRoleIds,
          userId,
        };
      }

      const removedRoleIds = [];
      const notPresentRoleIds = [];
      const failedRoleEntries = [];

      for (const roleId of grantedRoleIds) {
        let role = null;
        try {
          role = await guild.roles.fetch(roleId);
        } catch (err) {
          failedRoleEntries.push({
            roleId,
            reason: `fetch failed (${err.message})`,
          });
          continue;
        }

        if (!role) {
          failedRoleEntries.push({
            roleId,
            reason: "role not found in guild",
          });
          continue;
        }

        if (role.managed) {
          failedRoleEntries.push({
            roleId,
            reason: "managed/integration role",
          });
          continue;
        }

        if (me.roles.highest.comparePositionTo(role) <= 0) {
          failedRoleEntries.push({
            roleId,
            reason: "bot role hierarchy is too low",
          });
          continue;
        }

        if (!member.roles.cache.has(roleId)) {
          notPresentRoleIds.push(roleId);
          continue;
        }

        try {
          await member.roles.remove(
            roleId,
            `Application reopened (${getApplicationDisplayId(application)}) by ${actorId || "unknown"}`
          );
          removedRoleIds.push(roleId);
        } catch (err) {
          failedRoleEntries.push({
            roleId,
            reason: `remove failed (${err.message})`,
          });
        }
      }

      const summaryParts = [];
      if (removedRoleIds.length > 0) {
        summaryParts.push(
          `removed: ${removedRoleIds.map((id) => `<@&${id}>`).join(", ")}`
        );
      }
      if (notPresentRoleIds.length > 0) {
        summaryParts.push(
          `already missing: ${notPresentRoleIds.map((id) => `<@&${id}>`).join(", ")}`
        );
      }
      if (failedRoleEntries.length > 0) {
        summaryParts.push(
          `failed: ${failedRoleEntries
            .map((entry) => `<@&${entry.roleId}> (${entry.reason})`)
            .join(", ")}`
        );
      }

      let status = "failed_all";
      if (removedRoleIds.length > 0 && failedRoleEntries.length === 0) {
        status = "reverted";
      } else if (removedRoleIds.length > 0 && failedRoleEntries.length > 0) {
        status = "reverted_partial";
      } else if (notPresentRoleIds.length > 0 && failedRoleEntries.length === 0) {
        status = "skipped_not_present";
      }

      return {
        status,
        message:
          summaryParts.length > 0
            ? `Role revert for <@${member.id}>: ${summaryParts.join(" | ")}`
            : `No role changes were made for <@${member.id}>.`,
        roleIds: grantedRoleIds,
        removedRoleIds,
        notPresentRoleIds,
        failedRoleEntries,
        userId: member.id,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Role revert failed: ${err.message}`,
        roleIds: grantedRoleIds,
        userId,
      };
    }
  }

  // sendDeniedApplicationDm: handles send denied application dm.
  async function sendDeniedApplicationDm(application, decisionReason, behavior = {}) {
    const resolverHints = normalizeResolverHints(behavior?.resolverHints);
    const trackLabel = getTrackLabel(application.trackKey);
    let serverName = "Unknown Server";
    let sourceGuild = null;
    try {
      const channel = await client.channels.fetch(application.channelId);
      if (channel && "guild" in channel && channel.guild?.name) {
        serverName = channel.guild.name;
        sourceGuild = channel.guild;
      }
    } catch {
      // ignore and keep fallback server name
    }

    let applicantUserId = isSnowflake(application.applicantUserId)
      ? String(application.applicantUserId)
      : null;
    if (!applicantUserId && sourceGuild) {
      applicantUserId = await resolveApplicantUserIdFromApplication(
        application,
        sourceGuild,
        resolverHints
      );
      if (applicantUserId) {
        application.applicantUserId = applicantUserId;
      }
    }
    if (!applicantUserId) {
      return {
        status: "skipped_no_user",
        message:
          "No applicant Discord user could be resolved from discord_ID/submitted fields.",
        userId: null,
      };
    }

    const replacements = {
      user: `<@${applicantUserId}>`,
      user_id: applicantUserId,
      applicant_name: application.applicantName || "Applicant",
      track: trackLabel,
      application_id: getApplicationDisplayId(application),
      job_id: application.jobId || "Unknown",
      server: serverName,
      decision_source: application.decisionSource || "Unknown",
      reason: decisionReason || "",
      decided_at: application.decidedAt || new Date().toISOString(),
    };
    const template = getActiveDenyDmTemplate();
    const rendered = applyTemplatePlaceholders(template, replacements).trim();
    const content = rendered || defaultDenyDmTemplate;

    try {
      const user = await client.users.fetch(applicantUserId);
      await sendDebugDm(user, content);
      return {
        status: "sent",
        message: `Denied DM sent to <@${applicantUserId}>.`,
        userId: applicantUserId,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Failed sending denied DM to <@${applicantUserId}>: ${err.message}`,
        userId: applicantUserId,
      };
    }
  }

  // sendAcceptedApplicationAnnouncement: handles send accepted application announcement.
  async function sendAcceptedApplicationAnnouncement(application, roleResult, behavior = {}) {
    const resolverHints = normalizeResolverHints(behavior?.resolverHints);
    const channelId = getActiveAcceptAnnounceChannelId();
    if (!channelId) {
      return {
        status: "skipped_no_channel",
        message: "No accept announcement channel configured.",
        channelId: null,
      };
    }

    const trackLabel = getTrackLabel(application.trackKey);
    let serverName = "Unknown Server";
    let sourceGuild = null;
    try {
      const sourceChannel = await client.channels.fetch(application.channelId);
      if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
        serverName = sourceChannel.guild.name;
        sourceGuild = sourceChannel.guild;
      }
    } catch {
      // ignore and keep fallback
    }

    let applicantUserId = isSnowflake(application.applicantUserId)
      ? String(application.applicantUserId)
      : null;
    if (!applicantUserId && sourceGuild) {
      applicantUserId = await resolveApplicantUserIdFromApplication(
        application,
        sourceGuild,
        resolverHints
      );
      if (applicantUserId) {
        application.applicantUserId = applicantUserId;
      }
    }

    const replacements = {
      user: applicantUserId ? `<@${applicantUserId}>` : "",
      user_id: applicantUserId || "",
      applicant_name: application.applicantName || "Applicant",
      track: trackLabel,
      application_id: getApplicationDisplayId(application),
      job_id: application.jobId || "Unknown",
      server: serverName,
      role_result: roleResult?.message || "",
      reason: application.decisionReason || "",
      decided_at: application.decidedAt || new Date().toISOString(),
    };
    const template = getActiveAcceptAnnounceTemplate();
    const rendered = applyTemplatePlaceholders(template, replacements).trim();
    const content = rendered || defaultAcceptAnnounceTemplate;

    try {
      const sentMessage = await sendChannelMessage(channelId, content, {
        parse: [],
        users: applicantUserId ? [applicantUserId] : [],
      });
      return {
        status: "sent",
        message: `Acceptance announcement posted in <#${channelId}>.`,
        channelId,
        messageId: sentMessage?.id || null,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Failed posting acceptance announcement in <#${channelId}>: ${err.message}`,
        channelId,
        messageId: null,
      };
    }
  }

  // revertAcceptedAnnouncementOnReopen: handles revert accepted announcement on reopen.
  async function revertAcceptedAnnouncementOnReopen(application, actorId) {
    const channelId = String(application?.acceptAnnounceResult?.channelId || "").trim();
    const messageId = String(application?.acceptAnnounceResult?.messageId || "").trim();
    if (String(application?.acceptAnnounceResult?.status || "") !== "sent") {
      return {
        status: "skipped_no_sent_announcement",
        message: "No sent acceptance announcement to revert.",
        channelId: isSnowflake(channelId) ? channelId : null,
        messageId: isSnowflake(messageId) ? messageId : null,
      };
    }
    if (!isSnowflake(channelId) || !isSnowflake(messageId)) {
      return {
        status: "skipped_missing_message_reference",
        message:
          "Acceptance announcement reference is missing message ID; cannot auto-delete legacy announcement.",
        channelId: isSnowflake(channelId) ? channelId : null,
        messageId: null,
      };
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return {
          status: "failed_channel_unavailable",
          message: `Could not access accept-announcement channel <#${channelId}> for cleanup.`,
          channelId,
          messageId,
        };
      }

      const message = await channel.messages.fetch(messageId);
      if (!message) {
        return {
          status: "already_deleted",
          message: `Acceptance announcement was already deleted in <#${channelId}>.`,
          channelId,
          messageId,
        };
      }

      await message.delete(
        `Application reopened (${getApplicationDisplayId(application)}) by ${actorId || "unknown"}`
      );
      return {
        status: "reverted",
        message: `Deleted acceptance announcement in <#${channelId}>.`,
        channelId,
        messageId,
      };
    } catch (err) {
      const raw = String(err?.message || "");
      if (/unknown message/i.test(raw)) {
        return {
          status: "already_deleted",
          message: `Acceptance announcement was already deleted in <#${channelId}>.`,
          channelId,
          messageId,
        };
      }
      return {
        status: "failed_error",
        message: `Failed deleting acceptance announcement in <#${channelId}>: ${raw}`,
        channelId,
        messageId,
      };
    }
  }

  // sendReopenCompensationDm: handles send reopen compensation dm.
  async function sendReopenCompensationDm(
    application,
    previousStatus,
    actorId,
    reopenReason = "",
    behavior = {}
  ) {
    const resolverHints = normalizeResolverHints(behavior?.resolverHints);
    let serverName = "Unknown Server";
    let sourceGuild = null;
    try {
      const channel = await client.channels.fetch(application.channelId);
      if (channel && "guild" in channel && channel.guild?.name) {
        serverName = channel.guild.name;
        sourceGuild = channel.guild;
      }
    } catch {
      // ignore and keep fallback server name
    }

    let applicantUserId = isSnowflake(application.applicantUserId)
      ? String(application.applicantUserId)
      : null;
    if (!applicantUserId && sourceGuild) {
      applicantUserId = await resolveApplicantUserIdFromApplication(
        application,
        sourceGuild,
        resolverHints
      );
      if (applicantUserId) {
        application.applicantUserId = applicantUserId;
      }
    }
    if (!applicantUserId) {
      return {
        status: "skipped_no_user",
        message: "No applicant Discord user could be resolved for reopen compensation DM.",
        userId: null,
      };
    }

    const previousLabel = String(previousStatus || "unknown").toUpperCase();
    const lines = [
      "Your application decision was reopened and is now pending review.",
      `Previous decision: ${previousLabel}`,
      `Track: ${getTrackLabel(application.trackKey)}`,
      `Application ID: ${getApplicationDisplayId(application)}`,
      `Server: ${serverName}`,
      `Reopened by: ${actorId ? `<@${actorId}>` : "Unknown"}`,
    ];
    const normalizedReason = String(reopenReason || "").trim();
    if (normalizedReason) {
      lines.push(`Reopen reason: ${normalizedReason}`);
    }

    try {
      const user = await client.users.fetch(applicantUserId);
      await sendDebugDm(user, lines.join("\n"));
      return {
        status: "sent",
        message: `Reopen compensation DM sent to <@${applicantUserId}>.`,
        userId: applicantUserId,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Failed sending reopen compensation DM to <@${applicantUserId}>: ${err.message}`,
        userId: applicantUserId,
      };
    }
  }

  return {
    postClosureLog,
    grantApprovedRoleOnAcceptance,
    revertApprovedRolesOnReopen,
    revertAcceptedAnnouncementOnReopen,
    sendReopenCompensationDm,
    sendDeniedApplicationDm,
    sendAcceptedApplicationAnnouncement,
  };
}

module.exports = {
  createApplicationDecisionUtils,
};
