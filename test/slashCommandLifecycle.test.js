const test = require("node:test");
const assert = require("node:assert/strict");
const { SlashCommandBuilder } = require("discord.js");

const { createSlashCommandLifecycle } = require("../src/lib/slashCommandLifecycle");

test("buildSlashCommands includes unified /set command options", () => {
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
  const setCommand = commands.find((command) => command.name === "set");
  assert.ok(setCommand, "set command should exist");
  const optionNames = new Set(
    (Array.isArray(setCommand.options) ? setCommand.options : []).map((option) => option.name)
  );
  assert.ok(optionNames.has("mode"));
  assert.ok(optionNames.has("channel_target"));
  assert.ok(optionNames.has("track"));
  assert.ok(optionNames.has("channel"));
  assert.ok(optionNames.has("role"));
  assert.ok(optionNames.has("role_5"));
  assert.ok(optionNames.has("message"));

  const modeOption = (Array.isArray(setCommand.options) ? setCommand.options : []).find(
    (option) => option.name === "mode"
  );
  const modeValues = new Set(
    (Array.isArray(modeOption?.choices) ? modeOption.choices : []).map((choice) => choice.value)
  );
  assert.ok(modeValues.has("channel"));
  assert.ok(modeValues.has("default"));
  assert.ok(modeValues.has("approle"));
  assert.ok(modeValues.has("approlegui"));
  assert.ok(modeValues.has("denymsg"));
  assert.ok(modeValues.has("acceptmsg"));

  const commandNames = new Set(commands.map((command) => command.name));
  assert.equal(commandNames.has("setchannel"), false);
  assert.equal(commandNames.has("setapprole"), false);
  assert.equal(commandNames.has("setapprolegui"), false);
  assert.equal(commandNames.has("setdenymsg"), false);
  assert.equal(commandNames.has("setaccept"), false);
  assert.equal(commandNames.has("setacceptmsg"), false);
});

test("buildSlashCommands includes /reactionrole and /rr commands", () => {
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

  const rr = commands.find((command) => command.name === "rr");
  assert.ok(rr, "rr command should exist");
  const rrOptionNames = new Set(
    (Array.isArray(rr.options) ? rr.options : []).map((option) => option.name)
  );
  assert.ok(rrOptionNames.has("mode"));
  assert.ok(rrOptionNames.has("message_id"));
  assert.ok(rrOptionNames.has("emoji"));
  assert.ok(rrOptionNames.has("role"));
  assert.ok(rrOptionNames.has("channel"));
  const rrModeOption = (Array.isArray(rr.options) ? rr.options : []).find(
    (option) => option.name === "mode"
  );
  const rrModeValues = new Set(
    (Array.isArray(rrModeOption?.choices) ? rrModeOption.choices : []).map((choice) => choice.value)
  );
  assert.ok(rrModeValues.has("create"));
  assert.ok(rrModeValues.has("remove"));
  assert.ok(rrModeValues.has("list"));
  assert.ok(rrModeValues.has("gui"));
});

test("buildSlashCommands keeps /useapprole legacy command", () => {
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

test("buildSlashCommands includes single /settings command with action option", () => {
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
  const settings = commands.find((command) => command.name === "settings");
  assert.ok(settings, "settings command should exist");

  const optionNames = new Set(
    (Array.isArray(settings.options) ? settings.options : []).map((option) => option.name)
  );
  assert.ok(optionNames.has("action"));
  assert.ok(optionNames.has("track"));
  assert.ok(optionNames.has("numerator"));
  assert.ok(optionNames.has("denominator"));
  assert.ok(optionNames.has("minimum_votes"));
  assert.ok(optionNames.has("enabled"));
  assert.ok(optionNames.has("threshold_hours"));
  assert.ok(optionNames.has("repeat_hours"));
  assert.ok(optionNames.has("mentions"));
  assert.ok(optionNames.has("roles"));
  assert.ok(optionNames.has("hour_utc"));
  assert.ok(optionNames.has("spreadsheet_id"));
  assert.ok(optionNames.has("sheet_name"));
  assert.ok(optionNames.has("reset"));
  assert.ok(optionNames.has("message"));
  assert.ok(optionNames.has("json"));
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

test("buildSlashCommands includes /message unified command", () => {
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
  const message = commands.find((command) => command.name === "message");
  assert.ok(message, "message command should exist");
  const optionNames = new Set(
    (Array.isArray(message.options) ? message.options : []).map((option) => option.name)
  );
  assert.ok(optionNames.has("mode"));
  assert.ok(optionNames.has("channel"));
  assert.ok(optionNames.has("message_id"));
  assert.ok(optionNames.has("title"));
  assert.ok(optionNames.has("description"));
  assert.ok(optionNames.has("line_1"));
  assert.ok(optionNames.has("color"));
  assert.ok(optionNames.has("timestamp"));
  const modeOption = (Array.isArray(message.options) ? message.options : []).find(
    (option) => option.name === "mode"
  );
  const modeValues = new Set(
    (Array.isArray(modeOption?.choices) ? modeOption.choices : []).map((choice) => choice.value)
  );
  assert.ok(modeValues.has("structured"));
  assert.ok(modeValues.has("embed"));
  assert.ok(modeValues.has("edit"));
});

test("buildSlashCommands includes /repostapps command", () => {
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
  const repostApps = commands.find((command) => command.name === "repostapps");
  assert.ok(repostApps, "repostapps command should exist");
});

test("buildSlashCommands includes /accept mode option and /unassignedrole command", () => {
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
  const accept = commands.find((command) => command.name === "accept");
  assert.ok(accept, "accept command should exist");
  const acceptOptionNames = new Set(
    (Array.isArray(accept.options) ? accept.options : []).map((option) => option.name)
  );
  assert.ok(acceptOptionNames.has("mode"));

  const unassignedRole = commands.find((command) => command.name === "unassignedrole");
  assert.ok(unassignedRole, "unassignedrole command should exist");
});
