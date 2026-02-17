const test = require("node:test");
const assert = require("node:assert/strict");
const { SlashCommandBuilder } = require("discord.js");

const { createSlashCommandLifecycle } = require("../src/lib/slashCommandLifecycle");

test("buildSlashCommands includes dynamic /setchannel options for custom tracks", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [
      {
        trackKey: "tester",
        optionName: "tester_post",
        description: "Tester application post channel",
      },
    ],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester", "scripter"],
    getTrackLabel: (trackKey) => (trackKey === "scripter" ? "Scripter" : "Tester"),
  });

  const commands = buildSlashCommands();
  const setChannel = commands.find((command) => command.name === "setchannel");
  assert.ok(setChannel, "setchannel command should exist");

  const optionNames = new Set(
    (Array.isArray(setChannel.options) ? setChannel.options : []).map((option) => option.name)
  );
  assert.ok(optionNames.has("scripter_post"));
  assert.ok(optionNames.has("track"));
  assert.ok(optionNames.has("post_channel"));
});

test("buildSlashCommands includes /reactionrole command with core subcommands", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const reactionRole = commands.find((command) => command.name === "reactionrole");
  assert.ok(reactionRole, "reactionrole command should exist");

  const subcommandNames = new Set(
    (Array.isArray(reactionRole.options) ? reactionRole.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("create"));
  assert.ok(subcommandNames.has("remove"));
  assert.ok(subcommandNames.has("list"));
  assert.ok(subcommandNames.has("gui"));
});

test("buildSlashCommands includes /setapprolegui command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const commandNames = new Set(commands.map((command) => command.name));
  assert.ok(commandNames.has("setapprolegui"));
});

test("buildSlashCommands includes /useapprole legacy command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const legacy = commands.find((command) => command.name === "useapprole");
  assert.ok(legacy, "useapprole command should exist");

  const subcommandNames = new Set(
    (Array.isArray(legacy.options) ? legacy.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("manage"));
  assert.ok(subcommandNames.has("gui"));
});

test("buildSlashCommands includes /embedmsg command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const commandNames = new Set(commands.map((command) => command.name));
  assert.ok(commandNames.has("embedmsg"));
});

test("buildSlashCommands includes /embededit command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const commandNames = new Set(commands.map((command) => command.name));
  assert.ok(commandNames.has("embededit"));
});
