#!/usr/bin/env node
/**
 * GitHub GraphQL API からコントリビューション（非公開含む）を取得し JSON に保存する。
 * ローカル: GH_CONTRIBUTIONS_TOKEN=ghp_xxx node tools/fetch-github-contributions.js
 */
const fs = require('fs');
const path = require('path');

const LEVEL_MAP = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const QUERY = `
query {
  viewer {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`;

const main = async () => {
  const token = process.env.GH_CONTRIBUTIONS_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('GH_CONTRIBUTIONS_TOKEN (or GH_TOKEN) is required.');
    process.exit(1);
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'shiori-homepage-contributions',
    },
    body: JSON.stringify({ query: QUERY }),
  });

  if (!response.ok) {
    console.error(`GraphQL HTTP ${response.status}:`, await response.text());
    process.exit(1);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    console.error('GraphQL errors:', JSON.stringify(payload.errors, null, 2));
    process.exit(1);
  }

  const calendar = payload.data?.viewer?.contributionsCollection?.contributionCalendar;
  if (!calendar) {
    console.error('Unexpected GraphQL response shape.');
    process.exit(1);
  }

  const contributions = calendar.weeks.flatMap((week) =>
    week.contributionDays.map((day) => ({
      date: day.date,
      count: day.contributionCount,
      level: LEVEL_MAP[day.contributionLevel] ?? 0,
    }))
  );

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'github-graphql',
    total: { lastYear: calendar.totalContributions },
    contributions,
  };

  const outPath = path.join(__dirname, '../data/github-contributions.json');
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Saved ${contributions.length} days (${calendar.totalContributions} contributions) → ${outPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
