import { promises as fs } from "node:fs";
import path from "node:path";

const START_MARKER = "<!-- turbo:start -->";
const END_MARKER = "<!-- turbo:end -->";
const README_PATH = "README.md";
const METRICS_DIR = path.join("assets", "metrics");
const MAX_REPO_PAGES = 5;

const repository = process.env.GITHUB_REPOSITORY || "fabiano-filho/fabiano-filho";
const repositoryOwner = repository.includes("/") ? repository.split("/")[0] : repository;
const username = process.env.TURBO_README_USERNAME || repositoryOwner || "fabiano-filho";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const restHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "turbo-readme-generator"
};

if (token) {
  restHeaders.Authorization = `Bearer ${token}`;
}

function sanitizeText(value, maxLength = 90) {
  if (!value) {
    return "-";
  }

  const clean = String(value)
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1)}...`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toISOString().slice(0, 10);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toEndpointBadge(label, message, color) {
  return {
    schemaVersion: 1,
    label,
    message,
    color,
    style: "for-the-badge"
  };
}

async function writeJson(fileName, payload) {
  const fullPath = path.join(METRICS_DIR, fileName);
  await fs.writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function fetchJson(url, options = {}, optional = false) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...restHeaders,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    if (optional) {
      return null;
    }

    const body = await response.text();
    throw new Error(`HTTP ${response.status} for ${url}: ${body}`);
  }

  return response.json();
}

async function fetchAllRepos(login) {
  const repos = [];

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const url = `https://api.github.com/users/${login}/repos?type=owner&sort=updated&per_page=100&page=${page}`;
    const pageData = await fetchJson(url, {}, true);

    if (!Array.isArray(pageData) || pageData.length === 0) {
      break;
    }

    repos.push(...pageData);

    if (pageData.length < 100) {
      break;
    }
  }

  return repos;
}

async function fetchGraphQL(login) {
  if (!token) {
    return null;
  }

  const query = `
    query TurboProfile($login: String!) {
      user(login: $login) {
        contributionsCollection {
          totalCommitContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
        pinnedItems(first: 6, types: REPOSITORY) {
          nodes {
            ... on Repository {
              name
              description
              url
              stargazerCount
              primaryLanguage {
                name
              }
              pushedAt
            }
          }
        }
      }
      rateLimit {
        remaining
        resetAt
      }
    }
  `;

  const payload = await fetchJson(
    "https://api.github.com/graphql",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: { login }
      })
    },
    true
  );

  if (!payload || payload.errors) {
    return null;
  }

  return payload.data;
}

function collectContributionDays(graphqlData) {
  const weeks =
    graphqlData?.user?.contributionsCollection?.contributionCalendar?.weeks || [];

  return weeks
    .flatMap((week) => week.contributionDays || [])
    .map((day) => ({
      count: Number(day.contributionCount) || 0,
      date: day.date
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeStreak(days) {
  let best = 0;
  let current = 0;
  let active = 0;

  for (const day of days) {
    if (day.count > 0) {
      active += 1;
      if (active > best) {
        best = active;
      }
    } else {
      active = 0;
    }
  }

  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].count > 0) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, best };
}

function languageSummary(repos) {
  const languageMap = new Map();

  for (const repo of repos) {
    if (!repo.language) {
      continue;
    }

    languageMap.set(repo.language, (languageMap.get(repo.language) || 0) + 1);
  }

  return [...languageMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
}

function mapEvent(event) {
  const repoName = event?.repo?.name || "unknown/repo";
  const date = formatDate(event?.created_at);
  const action = event?.payload?.action ? ` (${event.payload.action})` : "";

  const dictionary = {
    PushEvent: `Push em [\`${repoName}\`](https://github.com/${repoName})`,
    PullRequestEvent: `PR${action} em [\`${repoName}\`](https://github.com/${repoName})`,
    PullRequestReviewEvent: `Review de PR${action} em [\`${repoName}\`](https://github.com/${repoName})`,
    IssuesEvent: `Issue${action} em [\`${repoName}\`](https://github.com/${repoName})`,
    IssueCommentEvent: `Comentario${action} em [\`${repoName}\`](https://github.com/${repoName})`,
    CreateEvent: `Criacao de ${event?.payload?.ref_type || "item"} em [\`${repoName}\`](https://github.com/${repoName})`,
    ForkEvent: `Fork de [\`${repoName}\`](https://github.com/${repoName})`,
    WatchEvent: `Star em [\`${repoName}\`](https://github.com/${repoName})`,
    ReleaseEvent: `Release${action} em [\`${repoName}\`](https://github.com/${repoName})`
  };

  const message = dictionary[event?.type] || `${event?.type || "Evento"} em [\`${repoName}\`](https://github.com/${repoName})`;
  return `- \`${date}\` ${message}`;
}

function buildDynamicBlock({
  user,
  repos,
  events,
  graphqlData,
  totalStars,
  totalForks,
  languages,
  streak
}) {
  const contributions =
    graphqlData?.user?.contributionsCollection?.contributionCalendar?.totalContributions || 0;

  const commits =
    graphqlData?.user?.contributionsCollection?.totalCommitContributions || 0;

  const hasGraphql = Boolean(graphqlData?.user?.contributionsCollection);
  const pinned = graphqlData?.user?.pinnedItems?.nodes || [];

  const pinnedLines = pinned.length
    ? pinned
        .map((item) => {
          const description = sanitizeText(item.description || "Sem descricao", 95);
          const language = item.primaryLanguage?.name || "N/A";
          return `- [\`${item.name}\`](${item.url}) - ${description} | ${language} | ${item.stargazerCount} stars | update ${formatDate(item.pushedAt)}`;
        })
        .join("\n")
    : hasGraphql
      ? "- Sem pinned repos retornados no momento (defina repos fixados no perfil para ativar esta area)."
      : "- Pinned projects indisponivel localmente sem GraphQL token. No GitHub Actions isso sera preenchido.";

  const recentActivity = events.length
    ? events.slice(0, 7).map(mapEvent).join("\n")
    : "- Nenhum evento publico recente encontrado.";

  const languageLines = languages.length
    ? languages.map((item) => `- ${item.name}: ${item.count} repos`).join("\n")
    : "- Linguagens nao identificadas nos repositorios retornados.";

  const contributionsCell = hasGraphql
    ? `**${contributions}**`
    : "N/A (GraphQL token required)";

  const commitsCell = hasGraphql
    ? `**${commits}**`
    : "N/A (GraphQL token required)";

  const streakCell = hasGraphql
    ? `**${streak.current} / ${streak.best} days**`
    : "N/A (GraphQL token required)";

  return [
    "### Live Telemetry",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Public repos | **${user?.public_repos ?? repos.length}** |`,
    `| Followers / Following | **${user?.followers ?? 0} / ${user?.following ?? 0}** |`,
    `| Stars received | **${totalStars}** |`,
    `| Forks received | **${totalForks}** |`,
    `| Contributions (last year) | ${contributionsCell} |`,
    `| Commit contributions (last year) | ${commitsCell} |`,
    `| Streak (current / best) | ${streakCell} |`,
    "",
    "#### Pinned Projects",
    pinnedLines,
    "",
    "#### Last Public Activity",
    recentActivity,
    "",
    "#### Language Footprint",
    languageLines,
    "",
    "> Updated automatically via GitHub Actions using GitHub REST + GraphQL APIs."
  ].join("\n");
}

async function main() {
  await fs.mkdir(METRICS_DIR, { recursive: true });

  const [user, repos, events, graphqlData] = await Promise.all([
    fetchJson(`https://api.github.com/users/${username}`, {}, true),
    fetchAllRepos(username),
    fetchJson(`https://api.github.com/users/${username}/events/public?per_page=100`, {}, true).then(
      (payload) => (Array.isArray(payload) ? payload : [])
    ),
    fetchGraphQL(username)
  ]);

  const safeUser = user || {
    public_repos: repos.length,
    followers: 0,
    following: 0
  };

  const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
  const languages = languageSummary(repos);
  const contributionDays = collectContributionDays(graphqlData);
  const streak = computeStreak(contributionDays);

  const dynamicBlock = buildDynamicBlock({
    user: safeUser,
    repos,
    events,
    graphqlData,
    totalStars,
    totalForks,
    languages,
    streak
  });

  const readme = await fs.readFile(README_PATH, "utf8");
  if (!readme.includes(START_MARKER) || !readme.includes(END_MARKER)) {
    throw new Error(`README markers not found: ${START_MARKER} ... ${END_MARKER}`);
  }

  const blockPattern = new RegExp(
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`,
    "m"
  );

  const updatedReadme = readme.replace(
    blockPattern,
    `${START_MARKER}\n${dynamicBlock}\n${END_MARKER}`
  );

  await fs.writeFile(README_PATH, updatedReadme, "utf8");

  const hasGraphql = Boolean(graphqlData?.user?.contributionsCollection);
  const focusLabel = languages.length
    ? sanitizeText(languages.slice(0, 3).map((item) => item.name).join(" + "), 28)
    : "mixed stack";

  const lastEventDate = events.length ? formatDate(events[0].created_at) : "none";

  await Promise.all([
    writeJson(
      "oss-score.json",
      toEndpointBadge("OSS score", `${totalStars} stars / ${repos.length} repos`, "0ea5e9")
    ),
    writeJson(
      "streak.json",
      toEndpointBadge(
        "Streak",
        hasGraphql ? `${streak.current}d now | ${streak.best}d best` : "GraphQL pending",
        "06b6d4"
      )
    ),
    writeJson("focus.json", toEndpointBadge("Focus", focusLabel, "0284c7")),
    writeJson("radar.json", toEndpointBadge("Radar", `last event ${lastEventDate}`, "0f766e"))
  ]);

  const rateLimit = graphqlData?.rateLimit;
  const rateInfo = rateLimit
    ? `GraphQL rate remaining: ${rateLimit.remaining} (reset ${rateLimit.resetAt})`
    : "GraphQL rate info unavailable (token or query not available).";

  console.log(`Turbo README updated for @${username}.`);
  console.log(`Repos: ${repos.length} | Stars: ${totalStars} | Forks: ${totalForks}`);
  console.log(rateInfo);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
