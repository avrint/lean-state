#!/usr/bin/env node
/**
 * Cucumber JSON → GitHub Actions job summary
 *
 * Structure:
 *   1. Global summary
 *   2. Index (links to features + scenarios with status)
 *   3. Features → Scenarios → collapsible steps
 *
 * Usage:
 *   node scripts/cucumber-to-summary.js [input.json] [output.md]
 *
 * In Actions:
 *   node scripts/cucumber-to-summary.js cucumber-report.json >> $GITHUB_STEP_SUMMARY
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

const inputPath = process.argv[2] || 'cucumber-report.json';
const outputPath = process.argv[3] || null;

const dashboardUrl = "https://svg.test-summary.com/dashboard.svg";
const passIconUrl = "https://svg.test-summary.com/icon/pass.svg?s=12";
const failIconUrl = "https://svg.test-summary.com/icon/fail.svg?s=12";
const skipIconUrl = "https://svg.test-summary.com/icon/skip.svg?s=12";

// ── helpers ──────────────────────────────────────────────────────────

function loadReport (file) {
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function escapeHtml (text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMd (text) {
  // minimal escaping for link text / table cells
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function statusIcon (status) {
  switch ((status || '').toLowerCase()) {
    case 'passed': return `<img src="${passIconUrl}" alt="Passed" />`;
    case 'failed': return `<img src="${failIconUrl}" alt="Failed" />`;
    case 'skipped':
    case 'pending': return `<img src="${skipIconUrl}" alt="Skipped" />`;
    case 'undefined':
    case 'ambiguous': return '⚠️';
    default: return '❓';
  }
}

function msToHuman (ms) {
  if (ms == null || isNaN(ms) || ms === 0) return '';

  const isNegative = ms < 0;
  const absMs = Math.abs(ms);

  let result = '';

  if (absMs < 1000) {
    result = `${Math.round(absMs)}ms`;
  } else if (absMs < 60000) {
    result = `${(absMs / 1000).toFixed(1)}s`;
  } else {
    let totalSeconds = Math.round(absMs / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    result = `${m}m ${s}s`;
  }

  return isNegative ? `-${result}` : result;
}

/** GitHub-style anchor from heading text */
function slugify (text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stepDurationMs (step) {
  const d = step.result?.duration;
  if (d == null) return 0;
  // Cucumber-JS classic JSON: duration is in nanoseconds
  // Some runners already use ms — heuristic: if > 1e10 treat as ns
  return d > 1e10 ? d / 1e6 : d;
}

function getScenarioStatus (scenario) {
  const steps = scenario.steps || [];
  if (!steps.length) return 'unknown';
  if (steps.some(s => s.result?.status === 'failed')) return 'failed';
  if (steps.some(s => s.result?.status === 'ambiguous')) return 'ambiguous';
  if (steps.some(s => s.result?.status === 'undefined')) return 'undefined';
  if (steps.some(s => s.result?.status === 'pending')) return 'pending';
  if (steps.every(s => s.result?.status === 'skipped')) return 'skipped';
  if (steps.every(s => ['passed', 'skipped'].includes(s.result?.status))) return 'passed';
  return 'unknown';
}

function scenarioDurationMs (scenario) {
  return (scenario.steps || []).reduce((sum, s) => sum + stepDurationMs(s), 0);
}

// ── collect ──────────────────────────────────────────────────────────

function collect (features) {
  const stats = {
    passed: 0, failed: 0, skipped: 0, pending: 0,
    undefined: 0, ambiguous: 0, total: 0, duration: 0,
  };

  const tree = []; // [{ feature, uri, scenarios: [{ scenario, status, duration }] }]

  for (const feature of features) {
    const scenarios = [];
    for (const el of feature.elements || []) {
      if (el.type === 'background') continue;

      const status = getScenarioStatus(el);
      const duration = scenarioDurationMs(el);

      stats.total++;
      if (stats[status] !== undefined) stats[status]++;
      else stats.failed++;
      stats.duration += duration;

      scenarios.push({ scenario: el, status, duration });
    }
    if (scenarios.length) {
      tree.push({
        feature: feature.name || basename(feature.uri || 'Feature'),
        uri: feature.uri || '',
        scenarios,
      });
    }
  }

  return { stats, tree };
}

// ── render ───────────────────────────────────────────────────────────

function renderGlobalSummary (stats) {
  const duration = msToHuman(stats.duration);

  // Aggregate non-passing statuses into fails or skips to align with test-summary SVG params
  const failedCount = stats.failed + stats.ambiguous + stats.undefined;
  const skippedCount = stats.skipped + stats.pending;

  let summaryText = "";
  if (stats.passed > 0) {
    summaryText += `${stats.passed} passed`;
  }
  if (failedCount > 0) {
    summaryText += `${summaryText ? ", " : ""}${failedCount} failed`;
  }
  if (skippedCount > 0) {
    summaryText += `${summaryText ? ", " : ""}${skippedCount} skipped`;
  }

  let md = `### Cucumber Results\n\n`;
  md += `<img src="${dashboardUrl}?p=${stats.passed}&f=${failedCount}&s=${skippedCount}" alt="${summaryText}">\n`;

  if (duration) md += `\n⏱ **Duration:** ${duration}\n`;
  md += `\n---\n\n`;

  return md;
}

function renderIndex (tree) {
  let md = `### Features\n\n`;

  for (const { feature, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    const featureFailed = scenarios.some(s => s.status === 'failed');
    const featureIcon = featureFailed ? `<img src="${failIconUrl}" alt="Failed" />` : `<img src="${passIconUrl}" alt="Passed" />`;

    md += `- ${featureIcon} [**${escapeMd(feature)}**](#${featureAnchor})\n`;

    for (const { scenario, status } of scenarios) {
      const name = scenario.name || 'Scenario';
      const anchor = slugify(`${feature}-${name}`);
      const icon = statusIcon(status);
      md += `  - ${icon} [${escapeMd(name)}](#${anchor})\n`;
    }
  }

  md += `\n---\n\n`;
  return md;
}

function renderSteps (scenario) {
  const steps = scenario.steps || [];
  if (!steps.length) return '_No steps_\n';

  let body = '';
  for (const step of steps) {
    const status = step.result?.status || 'unknown';
    const icon = statusIcon(status);
    const keyword = (step.keyword || '').trim();
    const name = step.name || '';
    const dur = msToHuman(stepDurationMs(step));
    const durSuffix = dur ? ` _( ${dur} )_` : '';

    body += `${icon} **${escapeHtml(keyword)}** ${escapeHtml(name)}${durSuffix}<br/>\n`;

    if (status === 'failed' && step.result?.error_message) {
      const err = step.result.error_message.trim().slice(0, 4000);
      body += `\n\`\`\`\n${err}\n\`\`\`\n`;
    }
  }
  return body;
}

function renderFeatures (tree) {
  let md = '';

  for (const { feature, uri, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    md += `<a id="${featureAnchor}"></a>\n`;
    md += `## ${escapeMd(feature)}\n\n`;
    if (uri) md += `📄 \`${uri}\`\n\n`;

    for (const { scenario, status, duration } of scenarios) {
      const name = scenario.name || 'Scenario';
      const anchor = slugify(`${feature}-${name}`);
      const icon = statusIcon(status);
      const dur = msToHuman(duration);

      md += `<a id="${anchor}"></a>\n`;
      md += `### ${icon} ${escapeMd(name)}\n\n`;
      if (dur) md += `⏱ ${dur}\n\n`;

      md += `<details>\n<summary>Steps</summary>\n\n`;
      md += renderSteps(scenario);
      md += `\n</details>\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

function buildMarkdown (features) {
  const { stats, tree } = collect(features);

  let md = '';
  md += renderGlobalSummary(stats);
  md += renderIndex(tree);
  md += renderFeatures(tree);
  return md;
}

// ── main ─────────────────────────────────────────────────────────────

const report = loadReport(inputPath);
const features = Array.isArray(report) ? report : [];
const markdown = buildMarkdown(features);

if (outputPath) {
  writeFileSync(outputPath, markdown, 'utf8');
  console.error(`Wrote ${outputPath}`);
}

process.stdout.write(markdown);