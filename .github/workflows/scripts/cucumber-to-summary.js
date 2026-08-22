#!/usr/bin/env node
/**
 * Cucumber JSON (Folder) → GitHub Actions job summary
 *
 * Structure:
 *   1. Global summary
 *   2. Index (links to features + scenarios with status)
 *   3. Features → Scenarios → collapsible steps
 *
 * Usage:
 *   node scripts/cucumber-to-summary.js [input_folder] [output.md]
 *
 * In Actions:
 *   node scripts/cucumber-to-summary.js reports/cucumber >> $GITHUB_STEP_SUMMARY
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { basename, join, extname } from 'path';

const inputDir = process.argv[2] || '.';
const outputPath = process.argv[3] || null;

const dashboardUrl = "https://svg.test-summary.com/dashboard.svg";
const passIconUrl = "https://svg.test-summary.com/icon/pass.svg?s=12";
const failIconUrl = "https://svg.test-summary.com/icon/fail.svg?s=12";
const skipIconUrl = "https://svg.test-summary.com/icon/skip.svg?s=12";

// ── helpers ──────────────────────────────────────────────────────────

function findJsonFiles(dir, fileList = []) {
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (extname(filePath) === '.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function loadReports(dir) {
  const jsonFiles = findJsonFiles(dir);
  if (jsonFiles.length === 0) {
    console.error(`No JSON files found in directory: ${dir}`);
    process.exit(1);
  }

  let allFeatures = [];
  for (const file of jsonFiles) {
    try {
      const content = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(content)) {
        allFeatures = allFeatures.concat(content);
      } else {
        allFeatures.push(content);
      }
    } catch (err) {
      console.error(`Error reading or parsing ${file}: ${err.message}`);
    }
  }
  return allFeatures;
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

function msToHuman(ms, options = {}) {
  if (ms == null || isNaN(ms) || ms === 0) return '';

  const {
    maxUnits = 7,         // Limit output depth (e.g., maxUnits: 2 -> '1y 2mo')
    compact = true,        // `true` for '1y 2m', `false` for '1 year 2 months'
    includeMs = true,      // Set to false to omit raw millisecond remainders
    hideZeros = false      // Set to true to drop 0-value intermediate units ('1y 2d')
  } = options;

  const isNegative = ms < 0;
  let absMs = Math.abs(ms);

  // Time unit conversions in milliseconds
  const UNITS = [
    { label: compact ? 'y' : ' year',   ms: 31536000000 },
    { label: compact ? 'mo' : ' month', ms: 2629800000 },
    { label: compact ? 'd' : ' day',    ms: 86400000 },
    { label: compact ? 'h' : ' hour',   ms: 3600000 },
    { label: compact ? 'm' : ' min',    ms: 60000 },
    { label: compact ? 's' : ' sec',    ms: 1000 },
    { label: compact ? 'ms' : ' ms',    ms: 1 }
  ];

  const parts = [];

  for (const { label, ms: unitMs } of UNITS) {
    if (label.includes('ms') && !includeMs) continue;

    const value = Math.floor(absMs / unitMs);

    if (value > 0 || (parts.length > 0 && !hideZeros)) {
      absMs %= unitMs;

      let displayLabel = label;
      if (!compact && value !== 1) {
        displayLabel += 's';
      }

      parts.push(`${value}${displayLabel}`);
    }

    if (parts.length === maxUnits) break;
  }

  if (parts.length === 0) return '';

  const result = parts.join(' ');
  return isNegative ? `-${result}` : result;
}

function slugify (text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stepDurationMs (d) {
  return d / 1e6;
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
  return (scenario.steps || []).reduce((sum, s) => sum + stepDurationMs(s.result?.duration), 0);
}

// ── collect ──────────────────────────────────────────────────────────

function collect (features) {
  const stats = {
    passed: 0, failed: 0, skipped: 0, pending: 0,
    undefined: 0, ambiguous: 0, total: 0, duration: 0,
  };

  const tree = [];

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
    const dur = msToHuman(stepDurationMs(step.result?.duration));
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

const features = loadReports(inputDir);
const markdown = buildMarkdown(features);

if (outputPath) {
  writeFileSync(outputPath, markdown, 'utf8');
  console.error(`Wrote ${outputPath}`);
}

process.stdout.write(markdown);