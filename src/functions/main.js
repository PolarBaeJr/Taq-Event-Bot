/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function main() {
  await client.login(config.botToken);
  await auditBotPermissions();
  await registerSlashCommands();

  try {
    const activeChannelId = getAnyActiveChannelId();
    if (!activeChannelId) {
      logger.info(
        "startup_no_active_channels",
        "No active application channels configured yet. Use /setchannel."
      );
    } else {
      const channel = await client.channels.fetch(activeChannelId);
      if (channel && "guild" in channel && channel.guild) {
        await ensureLogsChannel(channel.guild);
      }
    }
  } catch (err) {
    logger.error("startup_ensure_logs_channel_failed", "Failed ensuring logs channel on startup.", {
      error: err.message,
    });
  }

  await maintenanceManager.runMaintenance("startup").catch((err) => {
    logger.error("startup_maintenance_failed", "Startup maintenance run failed.", {
      error: err.message,
    });
  });
  if (backupManager.enabled) {
    await backupManager.runBackup("startup").catch((err) => {
      logger.error("startup_backup_failed", "Startup backup run failed.", {
        error: err.message,
      });
    });
  }

  logger.info("startup_bot_ready", "Bot started. Polling for Google Form responses.");
  if (config.alertOnStartup) {
    await sendOperationalAlert({
      event: "bot_started",
      severity: "info",
      title: "Bot started",
      message: "Taq Event Team Bot is online.",
      details: {
        pid: process.pid,
        node: process.version,
        pollIntervalMs: config.pollIntervalMs,
      },
    });
  }

  await pollOnce().catch((err) => {
    logger.error("startup_initial_poll_failed", "Initial poll failed.", {
      error: err.message,
    });
  });
  await maybeSendPendingReminders().catch((err) => {
    logger.error("startup_initial_reminder_failed", "Initial reminder pass failed.", {
      error: err.message,
    });
  });
  await maybeSendDailyDigest().catch((err) => {
    logger.error("startup_initial_digest_failed", "Initial digest pass failed.", {
      error: err.message,
    });
  });

  setInterval(async () => {
    try {
      await pollOnce();
      await maybeSendPendingReminders();
      await maybeSendDailyDigest();
    } catch (err) {
      logger.error("poll_cycle_failed", "Poll cycle failed.", {
        error: err.message,
      });
    }
  }, config.pollIntervalMs);

  const maintenanceIntervalMs =
    Number.isFinite(config.maintenanceIntervalMinutes) && config.maintenanceIntervalMinutes > 0
      ? Math.floor(config.maintenanceIntervalMinutes * 60000)
      : 3600000;
  setInterval(async () => {
    try {
      await maintenanceManager.runMaintenance("scheduled");
    } catch (err) {
      logger.error("scheduled_maintenance_failed", "Scheduled maintenance failed.", {
        error: err.message,
      });
    }
  }, maintenanceIntervalMs);

  if (backupManager.enabled) {
    const backupIntervalMs =
      Number.isFinite(config.backupIntervalMinutes) && config.backupIntervalMinutes > 0
        ? Math.floor(config.backupIntervalMinutes * 60000)
        : 6 * 60 * 60000;
    setInterval(async () => {
      await backupManager.runBackup("scheduled");
    }, backupIntervalMs);
  }
}

module.exports = main;
