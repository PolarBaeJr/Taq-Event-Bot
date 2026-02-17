/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

async function applyReactionRoleFromEvent(reaction, user, action = "add") {
  return requireReactionRoleManager().applyReactionRoleFromEvent(
    reaction,
    user,
    action
  );
}

module.exports = applyReactionRoleFromEvent;
