/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function grantApprovedRoleOnAcceptance(application) {
  const trackKey = normalizeTrackKey(application.trackKey) || DEFAULT_TRACK_KEY;
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
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
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
      return {
        status: "failed_member_not_found",
        message: `Applicant user <@${application.applicantUserId}> is not in this server.`,
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

module.exports = grantApprovedRoleOnAcceptance;
