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
  const missingMemberRoleStatusValue = String(
    options.missingMemberRoleStatusValue || "failed_member_not_found"
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

  async function getReviewersWithChannelAccess(channel, trackKey) {
    const members = await channel.guild.members.fetch();
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

  async function postReopenUpdate(application, previousStatus, actorId, reopenReason) {
    const summaryLines = [
      "♻️ **Application Reopened**",
      `Previous Decision: ${String(previousStatus || "").toUpperCase()}`,
      `By: <@${actorId}>`,
    ];
    if (reopenReason) {
      summaryLines.push(`Reason: ${reopenReason}`);
    }
    summaryLines.push(
      "Note: prior side effects (roles, DMs, announcements) are not automatically reverted."
    );
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
    application.reopenedAt = new Date().toISOString();
    application.reopenedBy = actorId;
    application.reopenReason = String(reopenReason || "").trim() || null;
    application.lastReminderAt = null;
    application.reminderCount = 0;
    writeState(state);

    await postReopenUpdate(
      application,
      previousStatus,
      actorId,
      application.reopenReason
    );

    return {
      ok: true,
      previousStatus,
      application,
    };
  }

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
      });

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
        roleResult
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
      const denyDmResult = await sendDeniedApplicationDm(application, denyDmReason);
      application.denyDmResult = denyDmResult;
      decisionReason = `${decisionReason}\n${denyDmResult.message}`;
    }

    writeState(state);

    await postDecisionUpdate(application, decision, decisionReason);
    await postForcedDecisionTemplateToThread(application, decision, decisionReason);
    await postClosureLog(application);

    return { ok: true, application };
  }

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
