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

  async function grantApprovedRoleOnAcceptance(application, behavior = {}) {
    const postMissingMemberThreadNotice =
      behavior?.postMissingMemberThreadNotice === true;
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

    if (!application.applicantUserId) {
      return {
        status: "skipped_no_user",
        message: "No applicant Discord user could be resolved from the form data.",
        roleIds: approvedRoleIds,
        userId: null,
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

      let member = null;
      try {
        member = await guild.members.fetch(application.applicantUserId);
      } catch {
        member = null;
      }

      if (!member) {
        let noticePosted = false;
        if (postMissingMemberThreadNotice) {
          noticePosted = await postApplicantNotInDiscordThreadNotice(application);
        }
        return {
          status: "failed_member_not_found",
          message: `Applicant user <@${application.applicantUserId}> is not in this server.${noticePosted ? " Posted configured not-in-server notice in the application thread." : ""}`,
          roleIds: approvedRoleIds,
          userId: application.applicantUserId,
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
        userId: application.applicantUserId,
      };
    }
  }

  async function sendDeniedApplicationDm(application, decisionReason) {
    if (!application.applicantUserId) {
      return {
        status: "skipped_no_user",
        message: "No applicant Discord user could be resolved from discord_ID.",
        userId: null,
      };
    }

    const trackLabel = getTrackLabel(application.trackKey);
    let serverName = "Unknown Server";
    try {
      const channel = await client.channels.fetch(application.channelId);
      if (channel && "guild" in channel && channel.guild?.name) {
        serverName = channel.guild.name;
      }
    } catch {
      // ignore and keep fallback server name
    }

    const replacements = {
      user: `<@${application.applicantUserId}>`,
      user_id: application.applicantUserId,
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
      const user = await client.users.fetch(application.applicantUserId);
      await sendDebugDm(user, content);
      return {
        status: "sent",
        message: `Denied DM sent to <@${application.applicantUserId}>.`,
        userId: application.applicantUserId,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Failed sending denied DM to <@${application.applicantUserId}>: ${err.message}`,
        userId: application.applicantUserId,
      };
    }
  }

  async function sendAcceptedApplicationAnnouncement(application, roleResult) {
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
    try {
      const sourceChannel = await client.channels.fetch(application.channelId);
      if (sourceChannel && "guild" in sourceChannel && sourceChannel.guild?.name) {
        serverName = sourceChannel.guild.name;
      }
    } catch {
      // ignore and keep fallback
    }

    const replacements = {
      user: application.applicantUserId ? `<@${application.applicantUserId}>` : "",
      user_id: application.applicantUserId || "",
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
      await sendChannelMessage(channelId, content, {
        parse: [],
        users: application.applicantUserId ? [application.applicantUserId] : [],
      });
      return {
        status: "sent",
        message: `Acceptance announcement posted in <#${channelId}>.`,
        channelId,
      };
    } catch (err) {
      return {
        status: "failed_error",
        message: `Failed posting acceptance announcement in <#${channelId}>: ${err.message}`,
        channelId,
      };
    }
  }

  return {
    postClosureLog,
    grantApprovedRoleOnAcceptance,
    sendDeniedApplicationDm,
    sendAcceptedApplicationAnnouncement,
  };
}

module.exports = {
  createApplicationDecisionUtils,
};
