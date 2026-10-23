/*
  Core module for minecraft links.
*/

const fs = require("node:fs");
const path = require("node:path");

// normalizeString: handles normalize string.
function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

// createMinecraftLinks: handles create minecraft links.
//
// Which Discord account is which Minecraft player, for cross chat. Kept in its own file
// rather than the bot state: the state is rebuilt through a normalisation pass on every
// write, and a field that pass does not know about is a field it quietly drops.
//
// One player per Discord account and one Discord account per player. Linking again moves
// the link rather than adding a second one.
function createMinecraftLinks(options = {}) {
  const file = normalizeString(options.file);
  const logger = options.logger && typeof options.logger === "object" ? options.logger : null;
  // Discord user ID -> { uuid, player, linkedAt }
  let byDiscord = {};

  if (file) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed.links === "object" && parsed.links) {
        byDiscord = parsed.links;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        logger?.warn?.("minecraft_links_read_failed", "Could not read the Minecraft links file.", {
          file,
          error: error.message,
        });
      }
    }
  }

  // save: handles save.
  function save() {
    if (!file) {
      return;
    }
    try {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ links: byDiscord }, null, 2));
    } catch (error) {
      logger?.error?.("minecraft_links_write_failed", "Could not save the Minecraft links file.", {
        file,
        error: error.message,
      });
    }
  }

  // get: handles get.
  function get(discordId) {
    return byDiscord[normalizeString(discordId)] || null;
  }

  // findByUuid: handles find by uuid. Returns the Discord ID linked to a player, or null.
  function findByUuid(uuid) {
    const wanted = normalizeString(uuid).toLowerCase();
    if (!wanted) {
      return null;
    }
    for (const [discordId, link] of Object.entries(byDiscord)) {
      if (normalizeString(link?.uuid).toLowerCase() === wanted) {
        return discordId;
      }
    }
    return null;
  }

  // set: handles set.
  function set(discordId, link) {
    const id = normalizeString(discordId);
    const previous = findByUuid(link.uuid);
    if (previous && previous !== id) {
      delete byDiscord[previous];
    }
    byDiscord[id] = {
      uuid: normalizeString(link.uuid),
      player: normalizeString(link.player),
      linkedAt: new Date().toISOString(),
    };
    save();
    return byDiscord[id];
  }

  // remove: handles remove. Returns the link that was removed, or null.
  function remove(discordId) {
    const id = normalizeString(discordId);
    const existing = byDiscord[id] || null;
    if (existing) {
      delete byDiscord[id];
      save();
    }
    return existing;
  }

  // updatePlayerName: handles update player name.
  //
  // Names change; UUIDs do not. Seeing a linked player under a new name keeps the stored
  // one current, so Discord to game messages use the name people know them by now.
  function updatePlayerName(uuid, player) {
    const id = findByUuid(uuid);
    const name = normalizeString(player);
    if (id && name && byDiscord[id].player !== name) {
      byDiscord[id].player = name;
      save();
    }
  }

  return { get, findByUuid, set, remove, updatePlayerName };
}

module.exports = { createMinecraftLinks };
