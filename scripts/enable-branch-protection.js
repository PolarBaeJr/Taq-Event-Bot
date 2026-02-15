#!/usr/bin/env node
const { execSync } = require("node:child_process");

function resolveRepositorySlug() {
  const remote = execSync("git config --get remote.origin.url", {
    encoding: "utf8",
  }).trim();

  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }
  throw new Error(
    `Unsupported remote.origin.url format for GitHub repository detection: ${remote}`
  );
}

async function main() {
  const branch = process.argv[2] || "main";
  const repository = process.env.GITHUB_REPOSITORY || resolveRepositorySlug();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("Set GH_TOKEN or GITHUB_TOKEN with repo admin scope before running.");
  }

  const body = {
    required_status_checks: {
      strict: true,
      contexts: ["validate"],
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: false,
    allow_fork_syncing: true,
  };

  const response = await fetch(
    `https://api.github.com/repos/${repository}/branches/${encodeURIComponent(branch)}/protection`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed setting branch protection (${response.status}): ${responseText}`
    );
  }

  console.log(
    `Branch protection applied for ${repository}@${branch} with required check: validate`
  );
}

main().catch((err) => {
  console.error(`[protect:main] ${err?.message || String(err)}`);
  process.exit(1);
});
