/*
  Core module for application id utils.
*/

function createApplicationIdUtils(options = {}) {
  const jobIdPattern = options.jobIdPattern instanceof RegExp
    ? options.jobIdPattern
    : /^job-(\d+)$/i;
  const defaultTrackKey = String(options.defaultTrackKey || "tester");
  const normalizeTrackKey = typeof options.normalizeTrackKey === "function"
    ? options.normalizeTrackKey
    : () => null;
  const getTrackLabel = typeof options.getTrackLabel === "function"
    ? options.getTrackLabel
    : (trackKey) => String(trackKey || "");

  // formatJobId: handles format job id.
  function formatJobId(sequence) {
    return `job-${String(sequence).padStart(6, "0")}`;
  }

  // parseJobIdSequence: handles parse job id sequence.
  function parseJobIdSequence(jobId) {
    if (typeof jobId !== "string") {
      return 0;
    }
    const match = jobIdPattern.exec(jobId.trim());
    if (!match) {
      return 0;
    }
    const sequence = Number(match[1]);
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return 0;
    }
    return sequence;
  }

  // parseLooseJobIdSequence: handles parse loose job id sequence.
  function parseLooseJobIdSequence(jobId) {
    const strict = parseJobIdSequence(jobId);
    if (strict > 0) {
      return strict;
    }

    if (typeof jobId !== "string") {
      return 0;
    }

    const trimmed = jobId.trim();
    if (!/^\d+$/.test(trimmed)) {
      return 0;
    }

    const sequence = Number(trimmed);
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return 0;
    }

    return sequence;
  }

  // normalizeJobIdForLookup: handles normalize job id for lookup.
  function normalizeJobIdForLookup(jobId) {
    const sequence = parseLooseJobIdSequence(jobId);
    if (sequence > 0) {
      return formatJobId(sequence).toLowerCase();
    }

    if (typeof jobId !== "string") {
      return "";
    }

    return jobId.trim().toLowerCase();
  }

  // normalizeApplicationIdForLookup: handles normalize application id for lookup.
  function normalizeApplicationIdForLookup(applicationId) {
    if (typeof applicationId !== "string") {
      return "";
    }

    const trimmed = applicationId.trim();
    if (!trimmed) {
      return "";
    }

    const match = /^([A-Za-z0-9]+)\s*-\s*(\d+)$/.exec(trimmed);
    if (!match) {
      return trimmed.toLowerCase();
    }

    const sequence = Number(match[2]);
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return trimmed.toLowerCase();
    }

    return `${match[1].toUpperCase()}-${sequence}`;
  }

  // compareJobsByOrder: handles compare jobs by order.
  function compareJobsByOrder(a, b) {
    const rowDiff = a.rowIndex - b.rowIndex;
    if (rowDiff !== 0) {
      return rowDiff;
    }

    const aSeq = parseJobIdSequence(a.jobId);
    const bSeq = parseJobIdSequence(b.jobId);
    if (aSeq > 0 && bSeq > 0 && aSeq !== bSeq) {
      return aSeq - bSeq;
    }

    const aCreated = Date.parse(a.createdAt || "");
    const bCreated = Date.parse(b.createdAt || "");
    if (!Number.isNaN(aCreated) && !Number.isNaN(bCreated) && aCreated !== bCreated) {
      return aCreated - bCreated;
    }

    return String(a.jobId).localeCompare(String(b.jobId));
  }

  // sortPostJobsInPlace: handles sort post jobs in place.
  function sortPostJobsInPlace(postJobs) {
    postJobs.sort(compareJobsByOrder);
  }

  // getTrackApplicationIdPrefix: handles get track application id prefix.
  function getTrackApplicationIdPrefix(trackKey) {
    const normalizedTrack = normalizeTrackKey(trackKey) || defaultTrackKey;
    const label = getTrackLabel(normalizedTrack);
    const cleaned = String(label).replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
    return cleaned || "APP";
  }

  // buildApplicationId: handles build application id.
  function buildApplicationId(trackKey, jobId, fallbackSequence = null) {
    let sequence = parseJobIdSequence(jobId);
    if (
      sequence <= 0 &&
      Number.isInteger(fallbackSequence) &&
      fallbackSequence > 0
    ) {
      sequence = fallbackSequence;
    }
    if (sequence <= 0) {
      return null;
    }
    return `${getTrackApplicationIdPrefix(trackKey)}-${sequence}`;
  }

  // getApplicationDisplayId: handles get application display id.
  function getApplicationDisplayId(application, fallbackMessageId = null) {
    const derived = buildApplicationId(application?.trackKey, application?.jobId);
    if (derived) {
      return derived;
    }

    const explicit = String(application?.applicationId || "").trim();
    if (explicit) {
      return explicit;
    }

    const messageId = String(application?.messageId || fallbackMessageId || "").trim();
    return messageId || "Unknown";
  }

  return {
    formatJobId,
    parseJobIdSequence,
    parseLooseJobIdSequence,
    normalizeJobIdForLookup,
    normalizeApplicationIdForLookup,
    compareJobsByOrder,
    sortPostJobsInPlace,
    getTrackApplicationIdPrefix,
    buildApplicationId,
    getApplicationDisplayId,
  };
}

module.exports = {
  createApplicationIdUtils,
};
