/*
  Core module for application decision workflow.
*/

const MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;

function createApplicationDecisionWorkflow(options = {}) {
  const client = options.client;
  const PermissionsBitField = options.PermissionsBitField;
  const viewChannelPermission = PermissionsBitField?.Flags?.ViewChannel;
  const acceptEmoji = String(options.acceptEmoji || "✅");
  const denyEmoji = String(options.denyEmoji || "❌");
  const statusAccepted = String(options.statusAccepted || "accepted");
  const statusDenied = String(options.statusDenied || "denied");
  const statusPending = String(options.statusPending || "pending");
  const resolveApplicationStatusColor =
    typeof options.resolveApplicationStatusColor === "function"
      ? options.resolveApplicationStatusColor
      : () => 0x2b2d31;
  const readState =
    typeof options.readState === "function"
      ? options.readState
      : () => ({ applications: {} });
  const writeState =
    typeof options.writeState === "function" ? options.writeState : () => {};
  const getApplicationDisplayId =
    typeof options.getApplicationDisplayId === "function"
      ? options.getApplicationDisplayId
      : () => "Unknown";
  const formatVoteRule =
    typeof options.formatVoteRule === "function"
      ? options.formatVoteRule
      : () => "configured vote rule";
  const computeVoteThreshold =
    typeof options.computeVoteThreshold === "function"
      ? options.computeVoteThreshold
      : () => ({ threshold: 1, rule: null });
  const getTrackVoterRoleIds =
    typeof options.getTrackVoterRoleIds === "function"
      ? options.getTrackVoterRoleIds
      : () => [];
  const grantApprovedRoleOnAcceptance =
    typeof options.grantApprovedRoleOnAcceptance === "function"
      ? options.grantApprovedRoleOnAcceptance
      : async () => ({ message: "No role action recorded." });
  const revertApprovedRolesOnReopen =
    typeof options.revertApprovedRolesOnReopen === "function"
      ? options.revertApprovedRolesOnReopen
      : async () => ({ message: "No role-revert action recorded." });
  const revertAcceptedAnnouncementOnReopen =
    typeof options.revertAcceptedAnnouncementOnReopen === "function"
      ? options.revertAcceptedAnnouncementOnReopen
      : async () => ({ message: "No announcement-revert action recorded." });
  const sendReopenCompensationDm =
    typeof options.sendReopenCompensationDm === "function"
      ? options.sendReopenCompensationDm
      : async () => ({ message: "No reopen-compensation DM action recorded." });
  const missingMemberRoleStatusValue = String(
    options.missingMemberRoleStatusValue || "failed_member_not_found"
  );
  const unresolvedUserRoleStatusValue = String(
    options.unresolvedUserRoleStatusValue || "failed_user_not_resolved"
  );
  const sendAcceptedApplicationAnnouncement =
    typeof options.sendAcceptedApplicationAnnouncement === "function"
      ? options.sendAcceptedApplicationAnnouncement
      : async () => ({ message: "No acceptance announcement action recorded." });
  const sendDeniedApplicationDm =
    typeof options.sendDeniedApplicationDm === "function"
      ? options.sendDeniedApplicationDm
      : async () => ({ message: "No denied-DM action recorded." });
  const postClosureLog =
    typeof options.postClosureLog === "function"
      ? options.postClosureLog
      : async () => {};
  const getTrackLabel =
    typeof options.getTrackLabel === "function"
      ? options.getTrackLabel
      : (trackKey) => String(trackKey || "");
  const getActiveAcceptAnnounceTemplate =
    typeof options.getActiveAcceptAnnounceTemplate === "function"
      ? options.getActiveAcceptAnnounceTemplate
      : () => "";
  const getActiveDenyDmTemplate =
    typeof options.getActiveDenyDmTemplate === "function"
      ? options.getActiveDenyDmTemplate
      : () => "";
  const defaultAcceptAnnounceTemplate = String(
    options.defaultAcceptAnnounceTemplate ||
      "Congratulations {user}, your {track} application has been accepted!"
  );
  const defaultDenyDmTemplate = String(
    options.defaultDenyDmTemplate || "Your application has been denied."
  );
  const applyTemplatePlaceholders =
    typeof options.applyTemplatePlaceholders === "function"
      ? options.applyTemplatePlaceholders
      : (template) => String(template || "");
  const toCodeBlock =
    typeof options.toCodeBlock === "function"
      ? options.toCodeBlock
      : (value) => String(value || "");

  // buildStatusColorEmbeds: handles build status color embeds.
  function buildStatusColorEmbeds(message, status) {
    const messageEmbeds = Array.isArray(message?.embeds) ? message.embeds : [];
    if (messageEmbeds.length === 0) {
      return null;
    }

    return messageEmbeds.map((embed, index) => {
      const editableEmbed =
        embed && typeof embed.toJSON === "function"
          ? embed.toJSON()
          : { ...(embed || {}) };
      if (index === 0) {
        editableEmbed.color = resolveApplicationStatusColor(status);
      }
      return editableEmbed;
    });
  }

  // postAcceptanceBlockedUpdate: handles post acceptance blocked update.
  async function postAcceptanceBlockedUpdate(application, reason) {
    const summary = [
      "⚠️ **Acceptance Blocked**",
      reason,
      "Application remains pending.",
      "Use `/accept ... mode:force` to accept anyway.",
    ].join("\n");

    try {
      const parentChannel = await client.channels.fetch(application.channelId);
      if (parentChannel && parentChannel.isTextBased()) {
        const message = await parentChannel.messages.fetch(application.messageId);
        await message.reply({ content: summary, allowedMentions: { parse: [] } });
      }
    } catch (err) {
      console.error(
        `Failed posting blocked-accept notice to parent message ${application.messageId}:`,
        err.message
      );
    }

    if (application.threadId) {
      try {
        const thread = await client.channels.fetch(application.threadId);
        if (thread && thread.isTextBased()) {
          if (
            "archived" in thread &&
            thread.archived &&
            typeof thread.setArchived === "function"
          ) {
            try {
              await thread.setArchived(false, "Posting acceptance-blocked notice");
            } catch {
              // ignore and continue
            }
          }
          await thread.send({ content: summary, allowedMentions: { parse: [] } });
        }
      } catch (err) {
        console.error(
          `Failed posting blocked-accept notice to thread ${application.threadId}:`,
          err.message
        );
      }
    }
  }

  const memberCacheByGuild = new Map();

  async function getCachedGuildMembers(guild) {
    const cached = memberCacheByGuild.get(guild.id);
    if (cached && Date.now() - cached.cachedAt < MEMBER_CACHE_TTL_MS) {
      return cached.members;
    }
    const members = await guild.members.fetch();
    memberCacheByGuild.set(guild.id, { members, cachedAt: Date.now() });
    return members;
  }

  // getReviewersWithChannelAccess: handles get reviewers with channel access.
  async function getReviewersWithChannelAccess(channel, trackKey) {
    const members = await getCachedGuildMembers(channel.guild);
    const reviewers = new Set();
    const voterRoleIds = new Set(getTrackVoterRoleIds(trackKey));
    const enforceRoleFilter = voterRoleIds.size > 0;
    const voterRoleIdList = enforceRoleFilter ? Array.from(voterRoleIds) : [];

    for (const member of members.values()) {
      if (member.user.bot) {
        continue;
      }

      if (enforceRoleFilter) {
        const hasAllowedRole = voterRoleIdList.some((roleId) =>
          member.roles?.cache?.has(roleId)
        );
        if (!hasAllowedRole) {
          continue;
        }
      }

      const perms = channel.permissionsFor(member);
      if (perms && viewChannelPermission && perms.has(viewChannelPermission)) {
        reviewers.add(member.id);
      }
    }

    return reviewers;
  }

  // getVoteSnapshot: handles get vote snapshot.
  async function getVoteSnapshot(message, eligibleReviewerIds) {
    const yesReaction = message.reactions.cache.find(
      (reaction) => reaction.emoji.name === acceptEmoji
    );
    const noReaction = message.reactions.cache.find(
      (reaction) => reaction.emoji.name === denyEmoji
    );

    const yesUsers = new Set();
    const noUsers = new Set();

    if (yesReaction) {
      const users = await yesReaction.users.fetch();
      for (const user of users.values()) {
        if (!user.bot && eligibleReviewerIds.has(user.id)) {
          yesUsers.add(user.id);
        }
      }
    }

    if (noReaction) {
      const users = await noReaction.users.fetch();
      for (const user of users.values()) {
        if (!user.bot && eligibleReviewerIds.has(user.id)) {
          noUsers.add(user.id);
        }
      }
    }

    for (const userId of yesUsers) {
      if (noUsers.has(userId)) {
        yesUsers.delete(userId);
        noUsers.delete(userId);
      }
    }

    return {
      yesCount: yesUsers.size,
      noCount: noUsers.size,
    };
  }

  // postDecisionUpdate: handles post decision update.
  async function postDecisionUpdate(application, decision, reason) {
    const decisionLabel = decision === statusAccepted ? "ACCEPTED" : "DENIED";
    const summary = `🧾 **Application ${decisionLabel}**\n${reason}`;

    try {
      const parentChannel = await client.channels.fetch(application.channelId);
      if (parentChannel && parentChannel.isTextBased()) {
        const message = await parentChannel.messages.fetch(application.messageId);
        const recoloredEmbeds = buildStatusColorEmbeds(message, decision);
        if (recoloredEmbeds) {
          try {
            await message.edit({ embeds: recoloredEmbeds });
          } catch (err) {
            console.error(
              `Failed updating message color for decision ${application.messageId}:`,
              err.message
            );
          }
        }
        await message.reply({ content: summary, allowedMentions: { parse: [] } });
      }
    } catch (err) {
      console.error(
        `Failed posting decision to parent message ${application.messageId}:`,
        err.message
      );
    }

    if (application.threadId) {
      try {
        const thread = await client.channels.fetch(application.threadId);
        if (thread && thread.isTextBased()) {
          if (
            "archived" in thread &&
            thread.archived &&
            typeof thread.setArchived === "function"
          ) {
            try {
              await thread.setArchived(false, "Posting application decision");
            } catch {
              // ignore and continue
            }
          }
          await thread.send({ content: summary, allowedMentions: { parse: [] } });
        }
      } catch (err) {
        console.error(
          `Failed posting decision to thread ${application.threadId}:`,
          err.message
        );
      }
    }
  }

  // archiveDecisionThread: handles archive decision thread.
  async function archiveDecisionThread(application, decision) {
    if (!application?.threadId) {
      return;
    }

    try {
      const thread = await client.channels.fetch(application.threadId);
      if (
        !thread ||
        !thread.isTextBased() ||
        typeof thread.setArchived !== "function"
      ) {
        return;
      }

      if ("archived" in thread && thread.archived) {
        return;
      }

      const archiveReason =
        decision === statusAccepted
          ? "Application accepted - archiving discussion thread"
          : "Application denied - archiving discussion thread";
      await thread.setArchived(true, archiveReason);
    } catch (err) {
      console.error(
        `Failed auto-archiving decision thread ${application.threadId}:`,
        err.message
      );
    }
  }

  // postForcedDecisionTemplateToThread: handles post forced decision template to thread.
  async function postForcedDecisionTemplateToThread(application, decision, decisionReason) {
    if (application?.decisionSource !== "force_command") {
      return;
    }
    if (!application?.threadId) {
      return;
    }

    try {
      const thread = await client.channels.fetch(application.threadId);
      if (!thread || !thread.isTextBased()) {
        return;
      }

      if (
        "archived" in thread &&
        thread.archived &&
        typeof thread.setArchived === "function"
      ) {
        try {
          await thread.setArchived(false, "Posting forced decision template message");
        } catch {
          // ignore and continue
        }
      }

      const trackLabel = getTrackLabel(application.trackKey);
      let serverName = "Unknown Server";
      try {
        const sourceChannel = await client.channels.fetch(application.channelId);
        if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
          serverName = sourceChannel.guild.name;
        }
      } catch {
        // keep fallback server name
      }

      const replacements = {
        user: application.applicantUserId ? `<@${application.applicantUserId}>` : "",
        user_id: application.applicantUserId || "",
        applicant_name: application.applicantName || "Applicant",
        track: trackLabel,
        application_id: getApplicationDisplayId(application),
        job_id: application.jobId || "Unknown",
        server: serverName,
        decision_source: application.decisionSource || "Unknown",
        role_result: application.approvedRoleResult?.message || "",
        reason: decisionReason || "",
        decided_at: application.decidedAt || new Date().toISOString(),
      };

      const isAccepted = decision === statusAccepted;
      const template = isAccepted
        ? getActiveAcceptAnnounceTemplate()
        : getActiveDenyDmTemplate();
      const fallback = isAccepted
        ? defaultAcceptAnnounceTemplate
        : defaultDenyDmTemplate;
      const rendered = applyTemplatePlaceholders(template, replacements).trim() || fallback;
      const label = isAccepted ? "ACCEPTED" : "DENIED";

      const lines = [
        `📨 **Forced ${label} Message**`,
        `**By:** ${application.decidedBy ? `<@${application.decidedBy}>` : "Unknown"}`,
        `**Application ID:** \`${getApplicationDisplayId(application)}\``,
        "",
        toCodeBlock(rendered),
      ];
      await thread.send({ content: lines.join("\n"), allowedMentions: { parse: [] } });
    } catch (err) {
      console.error(
        `Failed posting forced ${decision} template to thread ${application.threadId}:`,
        err.message
      );
    }
  }

  // postReopenUpdate: handles post reopen update.
  async function postReopenUpdate(
    application,
    previousStatus,
    actorId,
    reopenReason,
    reopenRoleRevertResult,
    reopenAnnouncementRevertResult,
    reopenDmCompensationResult
  ) {
    const summaryLines = [
      "♻️ **Application Reopened**",
      `Previous Decision: ${String(previousStatus || "").toUpperCase()}`,
      `By: <@${actorId}>`,
    ];
    if (reopenReason) {
      summaryLines.push(`Reason: ${reopenReason}`);
    }
    if (String(previousStatus || "").toLowerCase() === statusAccepted) {
      summaryLines.push(
        `Role Revert: ${reopenRoleRevertResult?.message || "No role revert action recorded."}`
      );
      summaryLines.push(
        `Announcement Revert: ${
          reopenAnnouncementRevertResult?.message ||
          "No announcement-revert action recorded."
        }`
      );
    }
    if (
      String(previousStatus || "").toLowerCase() === statusAccepted ||
      String(previousStatus || "").toLowerCase() === statusDenied
    ) {
      summaryLines.push(
        `DM Revert: ${
          reopenDmCompensationResult?.message || "No reopen-compensation DM action recorded."
        }`
      );
    }
    const summary = summaryLines.join("\n");

    try {
      const parentChannel = await client.channels.fetch(application.channelId);
      if (parentChannel && parentChannel.isTextBased()) {
        const message = await parentChannel.messages.fetch(application.messageId);
        const recoloredEmbeds = buildStatusColorEmbeds(message, statusPending);
        if (recoloredEmbeds) {
          try {
            await message.edit({ embeds: recoloredEmbeds });
          } catch (err) {
            console.error(
              `Failed updating message color for reopened application ${application.messageId}:`,
              err.message
            );
          }
        }
        await message.reply({ content: summary, allowedMentions: { parse: [] } });
      }
    } catch (err) {
      console.error(
        `Failed posting reopen notice to parent message ${application.messageId}:`,
        err.message
      );
    }

    if (application.threadId) {
      try {
        const thread = await client.channels.fetch(application.threadId);
        if (thread && thread.isTextBased()) {
          if (
            "archived" in thread &&
            thread.archived &&
            typeof thread.setArchived === "function"
          ) {
            try {
              await thread.setArchived(false, "Application reopened");
            } catch {
              // ignore and continue
            }
          }
          await thread.send({ content: summary, allowedMentions: { parse: [] } });
        }
      } catch (err) {
        console.error(
          `Failed posting reopen notice to thread ${application.threadId}:`,
          err.message
        );
      }
    }
  }

  // reopenApplication: handles reopen application.
  async function reopenApplication(messageId, actorId, reopenReason = "") {
    const state = readState();
    const application = state.applications[messageId];
    if (!application) {
      return { ok: false, reason: "unknown_application" };
    }
    if (application.status === statusPending) {
      return { ok: false, reason: "already_pending" };
    }

    const previousStatus = application.status;
    let reopenRoleRevertResult = null;
    let reopenAnnouncementRevertResult = null;
    let reopenDmCompensationResult = null;
    if (previousStatus === statusAccepted) {
      reopenRoleRevertResult = await revertApprovedRolesOnReopen(application, actorId);
      reopenAnnouncementRevertResult = await revertAcceptedAnnouncementOnReopen(
        application,
        actorId
      );
      reopenDmCompensationResult = await sendReopenCompensationDm(
        application,
        previousStatus,
        actorId,
        reopenReason
      );
    } else if (previousStatus === statusDenied) {
      reopenDmCompensationResult = await sendReopenCompensationDm(
        application,
        previousStatus,
        actorId,
        reopenReason
      );
    }
    application.lastDecision = {
      status: application.status,
      decidedAt: application.decidedAt || null,
      decidedBy: application.decidedBy || null,
      decisionSource: application.decisionSource || null,
      decisionReason: application.decisionReason || null,
    };
    application.status = statusPending;
    application.decidedAt = null;
    application.decidedBy = null;
    application.decisionSource = null;
    application.decisionReason = null;
    application.approvedRoleResult = null;
    application.lastAcceptanceBlock = null;
    application.acceptAnnounceResult = null;
    application.denyDmResult = null;
    application.voteContext = null;
    application.adminDone = false;
    application.reopenedAt = new Date().toISOString();
    application.reopenedBy = actorId;
    application.reopenReason = String(reopenReason || "").trim() || null;
    application.lastReminderAt = null;
    application.reminderCount = 0;
    application.reopenRoleRevertResult = reopenRoleRevertResult;
    application.reopenAnnouncementRevertResult = reopenAnnouncementRevertResult;
    application.reopenDmCompensationResult = reopenDmCompensationResult;
    writeState(state);

    await postReopenUpdate(
      application,
      previousStatus,
      actorId,
      application.reopenReason,
      reopenRoleRevertResult,
      reopenAnnouncementRevertResult,
      reopenDmCompensationResult
    );

    return {
      ok: true,
      previousStatus,
      reopenRoleRevertResult,
      reopenAnnouncementRevertResult,
      reopenDmCompensationResult,
      application,
    };
  }

  // finalizeApplication: handles finalize application.
  async function finalizeApplication(messageId, decision, sourceLabel, actorId, context = {}) {
    const state = readState();
    const application = state.applications[messageId];

    if (!application) {
      return { ok: false, reason: "unknown_application" };
    }

    if (application.status !== statusPending) {
      return { ok: false, reason: "already_decided", status: application.status };
    }

    application.applicationId = getApplicationDisplayId(application, messageId);
    const voteContext =
      context?.voteContext && typeof context.voteContext === "object"
        ? context.voteContext
        : null;
    const allowMissingMemberAccept = context?.allowMissingMemberAccept === true;
    const applicantResolverHints = Array.isArray(context?.applicantResolverHints)
      ? context.applicantResolverHints
      : [];
    const normalizedDecisionReason = String(context?.reason || "").trim() || null;
    const decidedAt = new Date().toISOString();
    let decisionReason =
      sourceLabel === "vote"
        ? `Decision reached by vote. YES ${voteContext?.yesCount ?? "?"}/${voteContext?.eligibleCount ?? "?"}, NO ${voteContext?.noCount ?? "?"}/${voteContext?.eligibleCount ?? "?"}, threshold ${voteContext?.threshold ?? "?"} using ${voteContext ? formatVoteRule(voteContext.rule) : "configured vote rule"}.`
        : `Forced by <@${actorId}> using slash command.`;
    if (normalizedDecisionReason) {
      decisionReason = `${decisionReason}\nReviewer reason: ${normalizedDecisionReason}`;
    }

    if (decision === statusAccepted) {
      const roleResult = await grantApprovedRoleOnAcceptance(application, {
        postMissingMemberThreadNotice: allowMissingMemberAccept,
        resolverHints: applicantResolverHints,
      });

      if (roleResult?.status === "failed_member_fetch_transient") {
        // Transient Discord API error — block acceptance and ask reviewer to retry.
        // Do NOT permanently record as lastAcceptanceBlock (it may succeed on retry).
        await postAcceptanceBlockedUpdate(
          application,
          String(roleResult.message || "Discord API error — please try accepting again.")
        );
        return {
          ok: false,
          reason: "member_fetch_transient_error",
          roleResult,
          warningPosted: true,
          application,
        };
      }

      if (roleResult?.status === unresolvedUserRoleStatusValue) {
        const blockReason =
          String(roleResult.message || "").trim() ||
          "Applicant Discord user could not be resolved.";
        const alreadyWarned = Boolean(
          application.lastAcceptanceBlock &&
            application.lastAcceptanceBlock.status === unresolvedUserRoleStatusValue &&
            String(application.lastAcceptanceBlock.reason || "") === blockReason
        );

        application.lastAcceptanceBlock = {
          status: unresolvedUserRoleStatusValue,
          userId: roleResult.userId || null,
          reason: blockReason,
          source: sourceLabel,
          actorId: actorId || null,
          warnedAt: decidedAt,
        };
        writeState(state);

        if (!alreadyWarned) {
          await postAcceptanceBlockedUpdate(application, blockReason);
        }

        return {
          ok: false,
          reason: "unresolved_applicant_user",
          roleResult,
          warningPosted: !alreadyWarned,
          application,
        };
      }

      if (
        roleResult?.status === missingMemberRoleStatusValue &&
        !allowMissingMemberAccept
      ) {
        const blockReason = String(roleResult.message || "").trim() ||
          "Applicant is not in this server.";
        const alreadyWarned = Boolean(
          application.lastAcceptanceBlock &&
            application.lastAcceptanceBlock.status === missingMemberRoleStatusValue &&
            String(application.lastAcceptanceBlock.userId || "") ===
              String(roleResult.userId || "")
        );

        application.lastAcceptanceBlock = {
          status: missingMemberRoleStatusValue,
          userId: roleResult.userId || null,
          reason: blockReason,
          source: sourceLabel,
          actorId: actorId || null,
          warnedAt: decidedAt,
        };
        writeState(state);

        if (!alreadyWarned) {
          await postAcceptanceBlockedUpdate(application, blockReason);
        }

        return {
          ok: false,
          reason: "missing_member_not_in_guild",
          roleResult,
          warningPosted: !alreadyWarned,
          application,
        };
      }

      application.status = decision;
      application.decidedAt = decidedAt;
      application.decidedBy = actorId;
      application.decisionSource = sourceLabel;
      application.decisionReason = normalizedDecisionReason;
      application.lastAcceptanceBlock = null;
      if (voteContext) {
        application.voteContext = voteContext;
      }
      application.approvedRoleResult = roleResult;
      decisionReason = `${decisionReason}\n${roleResult.message}`;
      const acceptAnnounceResult = await sendAcceptedApplicationAnnouncement(
        application,
        roleResult,
        {
          resolverHints: applicantResolverHints,
        }
      );
      application.acceptAnnounceResult = acceptAnnounceResult;
      decisionReason = `${decisionReason}\n${acceptAnnounceResult.message}`;
    } else if (decision === statusDenied) {
      application.status = decision;
      application.decidedAt = decidedAt;
      application.decidedBy = actorId;
      application.decisionSource = sourceLabel;
      application.decisionReason = normalizedDecisionReason;
      application.lastAcceptanceBlock = null;
      if (voteContext) {
        application.voteContext = voteContext;
      }
      const denyDmReason = application.decisionReason || decisionReason;
      const denyDmResult = await sendDeniedApplicationDm(application, denyDmReason, {
        resolverHints: applicantResolverHints,
      });
      application.denyDmResult = denyDmResult;
      decisionReason = `${decisionReason}\n${denyDmResult.message}`;
    }

    // Auto-close: decided applications are marked closed so they are hidden from
    // the default admin view and carry both their decision badge and the closed badge.
    application.adminDone = true;

    writeState(state);

    await postDecisionUpdate(application, decision, decisionReason);
    await postForcedDecisionTemplateToThread(application, decision, decisionReason);
    await postClosureLog(application);
    await archiveDecisionThread(application, decision);

    return { ok: true, application };
  }

  // evaluateAndApplyVoteDecision: handles evaluate and apply vote decision.
  async function evaluateAndApplyVoteDecision(messageId) {
    const state = readState();
    const application = state.applications[messageId];

    if (!application || application.status !== statusPending) {
      return;
    }

    const channel = await client.channels.fetch(application.channelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const message = await channel.messages.fetch(messageId);
    const eligibleReviewerIds = await getReviewersWithChannelAccess(
      channel,
      application.trackKey
    );
    if (eligibleReviewerIds.size === 0) {
      return;
    }

    const voteThreshold = computeVoteThreshold(
      eligibleReviewerIds.size,
      application.trackKey
    );
    const { yesCount, noCount } = await getVoteSnapshot(message, eligibleReviewerIds);

    if (yesCount >= voteThreshold.threshold && noCount >= voteThreshold.threshold) {
      return;
    }

    if (yesCount >= voteThreshold.threshold) {
      await finalizeApplication(messageId, statusAccepted, "vote", client.user.id, {
        voteContext: {
          eligibleCount: eligibleReviewerIds.size,
          yesCount,
          noCount,
          threshold: voteThreshold.threshold,
          rule: voteThreshold.rule,
        },
      });
      return;
    }

    if (noCount >= voteThreshold.threshold) {
      await finalizeApplication(messageId, statusDenied, "vote", client.user.id, {
        voteContext: {
          eligibleCount: eligibleReviewerIds.size,
          yesCount,
          noCount,
          threshold: voteThreshold.threshold,
          rule: voteThreshold.rule,
        },
      });
    }
  }

  return {
    finalizeApplication,
    evaluateAndApplyVoteDecision,
    reopenApplication,
  };
}

module.exports = {
  createApplicationDecisionWorkflow,
};
