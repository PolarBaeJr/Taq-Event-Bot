/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function readState() {
  try {
    const raw = fs.readFileSync(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);
    const postJobs = [];
    const usedJobIds = new Set();
    let generatedSequence = 1;
    let highestSeenSequence = 0;
    const rawJobs = Array.isArray(parsed.postJobs) ? parsed.postJobs : [];

    for (const rawJob of rawJobs) {
      if (!rawJob || typeof rawJob !== "object") {
        continue;
      }

      const rowIndex = Number(rawJob.rowIndex);
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        continue;
      }

      let jobSequence = parseJobIdSequence(rawJob.jobId);
      if (jobSequence <= 0 || usedJobIds.has(formatJobId(jobSequence))) {
        while (usedJobIds.has(formatJobId(generatedSequence))) {
          generatedSequence += 1;
        }
        jobSequence = generatedSequence;
      }

      const normalizedJobId = formatJobId(jobSequence);
      usedJobIds.add(normalizedJobId);
      highestSeenSequence = Math.max(highestSeenSequence, jobSequence);
      if (generatedSequence <= jobSequence) {
        generatedSequence = jobSequence + 1;
      }

      const normalizedHeaders = Array.isArray(rawJob.headers)
        ? rawJob.headers.map(normalizeCell)
        : [];
      const normalizedRow = Array.isArray(rawJob.row)
        ? rawJob.row.map(normalizeCell)
        : [];

      postJobs.push({
        jobId: normalizedJobId,
        type: JOB_TYPE_POST_APPLICATION,
        rowIndex,
        trackKeys: normalizeTrackKeys(
          Array.isArray(rawJob.trackKeys) ? rawJob.trackKeys : rawJob.trackKey,
          {
            fallback: inferApplicationTracks(normalizedHeaders, normalizedRow),
          }
        ),
        postedTrackKeys: normalizeTrackKeys(rawJob.postedTrackKeys, {
          allowEmpty: true,
          fallback: [],
        }),
        responseKey:
          typeof rawJob.responseKey === "string" && rawJob.responseKey.trim()
            ? rawJob.responseKey.trim()
            : buildResponseKey(normalizedHeaders, normalizedRow),
        headers: normalizedHeaders,
        row: normalizedRow,
        createdAt:
          typeof rawJob.createdAt === "string"
            ? rawJob.createdAt
            : new Date().toISOString(),
        attempts:
          Number.isInteger(rawJob.attempts) && rawJob.attempts >= 0
            ? rawJob.attempts
            : 0,
        lastAttemptAt:
          typeof rawJob.lastAttemptAt === "string" ? rawJob.lastAttemptAt : null,
        lastError: typeof rawJob.lastError === "string" ? rawJob.lastError : null,
      });
    }
    sortPostJobsInPlace(postJobs);

    let nextJobId = Number(parsed.nextJobId);
    if (!Number.isInteger(nextJobId) || nextJobId < 1) {
      nextJobId = 1;
    }
    if (nextJobId <= highestSeenSequence) {
      nextJobId = highestSeenSequence + 1;
    }

    const legacySettings = parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : {};
    const normalizedChannels = normalizeTrackMap(legacySettings.channels);
    const normalizedApprovedRoles = normalizeTrackRoleMap(legacySettings.approvedRoles);
    if (isSnowflake(legacySettings.channelId) && !normalizedChannels[TRACK_TESTER]) {
      normalizedChannels[TRACK_TESTER] = legacySettings.channelId;
    }
    if (
      isSnowflake(legacySettings.approvedRoleId) &&
      normalizedApprovedRoles[TRACK_TESTER].length === 0
    ) {
      normalizedApprovedRoles[TRACK_TESTER] = [legacySettings.approvedRoleId];
    }

    return {
      lastRow: typeof parsed.lastRow === "number" ? parsed.lastRow : 1,
      applications:
        parsed.applications && typeof parsed.applications === "object"
          ? parsed.applications
          : {},
      threads:
        parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {},
      controlActions:
        Array.isArray(parsed.controlActions) ? parsed.controlActions : [],
      nextJobId,
      postJobs,
      settings: {
        channels: normalizedChannels,
        logChannelId: isSnowflake(legacySettings.logChannelId)
          ? legacySettings.logChannelId
          : null,
        approvedRoles: normalizedApprovedRoles,
        acceptAnnounceChannelId: isSnowflake(legacySettings.acceptAnnounceChannelId)
          ? legacySettings.acceptAnnounceChannelId
          : null,
        acceptAnnounceTemplate:
          typeof legacySettings.acceptAnnounceTemplate === "string" &&
          legacySettings.acceptAnnounceTemplate.trim()
            ? legacySettings.acceptAnnounceTemplate
            : null,
        denyDmTemplate:
          typeof legacySettings.denyDmTemplate === "string" &&
          legacySettings.denyDmTemplate.trim()
            ? legacySettings.denyDmTemplate
            : null,
      },
    };
  } catch {
    return defaultState();
  }
}

module.exports = readState;
