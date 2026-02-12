import { promises as fs } from "node:fs";
import path from "node:path";

const START_MARKER = "<!-- turbo:start -->";
const END_MARKER = "<!-- turbo:end -->";
const TECH_START_MARKER = "<!-- tech:start -->";
const TECH_END_MARKER = "<!-- tech:end -->";
const README_PATH = "README.md";
const METRICS_DIR = path.join("assets", "metrics");
const SIGNALS_DIR = path.join("assets", "signals");
const MAX_REPO_PAGES = 5;
const MAX_STACK_TOP = 10;

const repository = process.env.GITHUB_REPOSITORY || "fabiano-filho/fabiano-filho";
const repositoryOwner = repository.includes("/") ? repository.split("/")[0] : repository;
const username = process.env.TURBO_README_USERNAME || repositoryOwner || "fabiano-filho";
const token = process.env.TURBO_README_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const rawStackTop = Number.parseInt(process.env.TURBO_STACK_TOP || "10", 10);
const stackTopLimit = Number.isFinite(rawStackTop)
  ? Math.max(1, Math.min(MAX_STACK_TOP, rawStackTop))
  : 10;

const restHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "turbo-readme-generator"
};

const DEVICON_URLS = {
  "c": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg",
  "c++": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg",
  "c#": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg",
  "css": "https://raw.githubusercontent.com/devicons/devicon/master/icons/css3/css3-original.svg",
  "dart": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg",
  "django": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg",
  "go": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg",
  "graphql": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/graphql/graphql-plain.svg",
  "html": "https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original.svg",
  "java": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
  "javascript": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
  "kotlin": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg",
  "php": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg",
  "python": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
  "rust": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg",
  "sql": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg",
  "tsql": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/microsoftsqlserver/microsoftsqlserver-plain.svg",
  "typescript": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg",
  "vue": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg"
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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function signalCardSvg({ title, accent, rows, footer }) {
  const safeTitle = escapeXml(title);
  const safeFooter = escapeXml(footer);
  const renderedRows = rows
    .slice(0, 4)
    .map((row, index) => {
      const y = 72 + index * 24;
      return `<text x="28" y="${y}" fill="#e2e8f0" font-size="15" font-family="Consolas, 'Courier New', monospace">${escapeXml(row)}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="560" height="180" viewBox="0 0 560 180" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#152238"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="560" height="180" fill="url(#bg)" rx="18"/>
  <rect x="0" y="0" width="560" height="8" fill="url(#accent)" rx="18"/>
  <text x="28" y="42" fill="#7dd3fc" font-size="22" font-weight="700" font-family="Consolas, 'Courier New', monospace">${safeTitle}</text>
  ${renderedRows}
  <text x="28" y="162" fill="#94a3b8" font-size="13" font-family="Consolas, 'Courier New', monospace">${safeFooter}</text>
</svg>
`;
}

async function writeSignalCards({
  user,
  repos,
  totalStars,
  totalForks,
  events,
  topLanguagesLine,
  contributionsCell,
  streakCell
}) {
  const lastEventDate = events.length ? formatDate(events[0]?.created_at) : "none";
  const followers = user?.followers ?? 0;
  const following = user?.following ?? 0;

  const velocityCard = signalCardSvg({
    title: "SIGNAL // Velocity",
    accent: "#0ea5e9",
    rows: [
      `Repos: ${repos.length}`,
      `Stars: ${totalStars} | Forks: ${totalForks}`,
      `Followers: ${followers} | Following: ${following}`,
      `Last event: ${lastEventDate}`
    ],
    footer: "Source: GitHub REST API"
  });

  const stackCard = signalCardSvg({
    title: "SIGNAL // Stack",
    accent: "#14b8a6",
    rows: [
      `Top langs: ${topLanguagesLine}`,
      `Contribs(12m): ${contributionsCell}`,
      `Streak: ${streakCell}`,
      `Focus: ${sanitizeText(topLanguagesLine, 48)}`
    ],
    footer: "Source: GitHub REST + GraphQL"
  });

  await Promise.all([
    fs.writeFile(path.join(SIGNALS_DIR, "velocity.svg"), velocityCard, "utf8"),
    fs.writeFile(path.join(SIGNALS_DIR, "stack.svg"), stackCard, "utf8")
  ]);
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

async function fetchReposFromUrl(baseUrl) {
  const repos = [];

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${separator}per_page=100&page=${page}`;
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

function dedupeRepos(repos) {
  const byFullName = new Map();

  for (const repo of repos) {
    if (!repo?.full_name) {
      continue;
    }

    byFullName.set(repo.full_name, repo);
  }

  return [...byFullName.values()];
}

async function fetchAllRepos(login) {
  if (token) {
    const authRepos = await fetchReposFromUrl(
      "https://api.github.com/user/repos?affiliation=owner&visibility=all&sort=updated&type=owner"
    );

    if (authRepos.length > 0) {
      return {
        repos: dedupeRepos(authRepos),
        visibilityMode: "authenticated"
      };
    }
  }

  const publicRepos = await fetchReposFromUrl(
    `https://api.github.com/users/${login}/repos?type=owner&sort=updated`
  );

  return {
    repos: dedupeRepos(publicRepos),
    visibilityMode: "public"
  };
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

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const size = Math.max(1, limit);

  const runners = new Array(size).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        continue;
      }

      await worker(item);
    }
  });

  await Promise.all(runners);
}

async function aggregateLanguageUsage(repos) {
  const totals = new Map();
  const eligibleRepos = repos.filter((repo) => repo?.languages_url);

  await runWithConcurrency(eligibleRepos, 8, async (repo) => {
    const payload = await fetchJson(repo.languages_url, {}, true);
    if (!payload || Array.isArray(payload) || typeof payload !== "object") {
      return;
    }

    for (const [language, bytes] of Object.entries(payload)) {
      const value = Number(bytes) || 0;
      if (value <= 0) {
        continue;
      }

      totals.set(language, (totals.get(language) || 0) + value);
    }
  });

  return totals;
}

function buildLanguageRanking(totals, limit) {
  const entries = [...totals.entries()]
    .filter(([, bytes]) => bytes > 0)
    .sort((left, right) => right[1] - left[1]);

  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  return entries.slice(0, limit).map(([name, bytes], index) => {
    const share = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
    return {
      rank: index + 1,
      name,
      share,
      shareLabel: `${share.toFixed(1)}%`
    };
  });
}

function normalizeLanguageKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("objective-c", "objectivec")
    .replace("c++", "c++")
    .replace("c#", "c#");
}

function iconForLanguage(name) {
  const normalized = normalizeLanguageKey(name);
  if (DEVICON_URLS[normalized]) {
    return DEVICON_URLS[normalized];
  }

  if (normalized.includes("sql")) {
    return DEVICON_URLS.tsql;
  }

  return "";
}

function languageIconTag(item) {
  const src = iconForLanguage(item.name);
  const title = `#${item.rank} ${item.name} - ${item.shareLabel}`;

  if (src) {
    return `<img align="center" alt="${item.name}" height="34" width="44" src="${src}" title="${title}"/>`;
  }

  const label = encodeURIComponent(item.name);
  const share = encodeURIComponent(item.shareLabel);
  return `<img alt="${item.name}" src="https://img.shields.io/badge/${label}-${share}-0f172a?style=flat-square" title="${title}"/>`;
}

function buildTechStackBlock({ languageRanking, visibilityMode, reposCount, topLimit }) {
  const modeLabel =
    visibilityMode === "authenticated"
      ? "authenticated token (private repos included when token has access)"
      : "public repos only";

  if (!languageRanking.length) {
    return [
      "### Auto Stack",
      "",
      "_No language usage data found from repository API._",
      "",
      `_Mode: ${modeLabel} | Repos analyzed: ${reposCount}_`
    ].join("\n");
  }

  return [
    `### Auto Stack (Top ${Math.min(topLimit, languageRanking.length)})`,
    "",
    `_Mode: ${modeLabel} | Repos analyzed: ${reposCount}_`,
    "",
    "<div align=\"center\">",
    `  ${languageRanking.map((item) => languageIconTag(item)).join("\n  ")}`,
    "</div>",
    "",
    `<sub>${languageRanking.map((item) => `${item.rank}) ${item.name} ${item.shareLabel}`).join(" | ")}</sub>`
  ].join("\n");
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

function buildDynamicBlock({ events }) {
  const uniqueActivity = [];
  const seen = new Set();

  for (const event of events) {
    const line = mapEvent(event);
    if (seen.has(line)) {
      continue;
    }

    seen.add(line);
    uniqueActivity.push(line);

    if (uniqueActivity.length === 5) {
      break;
    }
  }

  const recentActivity = uniqueActivity.length
    ? uniqueActivity.join("\n")
    : "- Nenhum evento publico recente encontrado.";

  return [
    "### Live Feed",
    "",
    "#### Last Public Activity",
    recentActivity,
    "",
    "> Updated automatically via GitHub Actions using GitHub REST + GraphQL APIs."
  ].join("\n");
}

async function main() {
  await fs.mkdir(METRICS_DIR, { recursive: true });
  await fs.mkdir(SIGNALS_DIR, { recursive: true });

  const [user, repoData, events, graphqlData] = await Promise.all([
    fetchJson(`https://api.github.com/users/${username}`, {}, true),
    fetchAllRepos(username),
    fetchJson(`https://api.github.com/users/${username}/events/public?per_page=100`, {}, true).then(
      (payload) => (Array.isArray(payload) ? payload : [])
    ),
    fetchGraphQL(username)
  ]);

  const repos = repoData.repos;
  const visibilityMode = repoData.visibilityMode;
  const safeUser = user || {
    public_repos: repos.length,
    followers: 0,
    following: 0
  };

  const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
  const languageTotals = await aggregateLanguageUsage(repos);
  const languageRanking = buildLanguageRanking(languageTotals, stackTopLimit);
  const topLanguagesLine = languageRanking.length
    ? languageRanking
        .slice(0, 3)
        .map((item) => `${item.name}(${item.shareLabel})`)
        .join(" | ")
    : "No language data";
  const contributionDays = collectContributionDays(graphqlData);
  const streak = computeStreak(contributionDays);

  const dynamicBlock = buildDynamicBlock({ events });
  const techStackBlock = buildTechStackBlock({
    languageRanking,
    visibilityMode,
    reposCount: repos.length,
    topLimit: stackTopLimit
  });

  const readme = await fs.readFile(README_PATH, "utf8");
  if (!readme.includes(START_MARKER) || !readme.includes(END_MARKER)) {
    throw new Error(`README markers not found: ${START_MARKER} ... ${END_MARKER}`);
  }
  if (!readme.includes(TECH_START_MARKER) || !readme.includes(TECH_END_MARKER)) {
    throw new Error(`README markers not found: ${TECH_START_MARKER} ... ${TECH_END_MARKER}`);
  }

  const turboPattern = new RegExp(
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`,
    "m"
  );
  const techPattern = new RegExp(
    `${escapeRegExp(TECH_START_MARKER)}[\\s\\S]*?${escapeRegExp(TECH_END_MARKER)}`,
    "m"
  );

  let updatedReadme = readme.replace(
    turboPattern,
    `${START_MARKER}\n${dynamicBlock}\n${END_MARKER}`
  );
  updatedReadme = updatedReadme.replace(
    techPattern,
    `${TECH_START_MARKER}\n${techStackBlock}\n${TECH_END_MARKER}`
  );

  await fs.writeFile(README_PATH, updatedReadme, "utf8");

  const hasGraphql = Boolean(graphqlData?.user?.contributionsCollection);
  const contributionCount =
    graphqlData?.user?.contributionsCollection?.contributionCalendar?.totalContributions || 0;
  const focusLabel = languageRanking.length
    ? sanitizeText(languageRanking.slice(0, 3).map((item) => item.name).join(" + "), 28)
    : "mixed stack";
  const contributionsSignal = hasGraphql ? `${contributionCount}` : "GraphQL pending";
  const streakSignal = hasGraphql
    ? `${streak.current}d now | ${streak.best}d best`
    : "GraphQL pending";

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
        streakSignal,
        "06b6d4"
      )
    ),
    writeJson("focus.json", toEndpointBadge("Focus", focusLabel, "0284c7")),
    writeJson("radar.json", toEndpointBadge("Radar", `last event ${lastEventDate}`, "0f766e")),
    writeSignalCards({
      user: safeUser,
      repos,
      totalStars,
      totalForks,
      events,
      topLanguagesLine,
      contributionsCell: contributionsSignal,
      streakCell: streakSignal
    })
  ]);

  const rateLimit = graphqlData?.rateLimit;
  const rateInfo = rateLimit
    ? `GraphQL rate remaining: ${rateLimit.remaining} (reset ${rateLimit.resetAt})`
    : "GraphQL rate info unavailable (token or query not available).";

  console.log(`Turbo README updated for @${username}.`);
  console.log(`Repos: ${repos.length} | Stars: ${totalStars} | Forks: ${totalForks}`);
  console.log(`Repo visibility mode: ${visibilityMode}`);
  console.log(`Top stack (${stackTopLimit}): ${topLanguagesLine}`);
  console.log(rateInfo);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
