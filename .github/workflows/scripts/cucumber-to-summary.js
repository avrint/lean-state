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

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'cucumber-report.json';
const outputPath = process.argv[3] || null;

// ── helpers ──────────────────────────────────────────────────────────

function loadReport(file) {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMd(text) {
  // minimal escaping for link text / table cells
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function statusIcon(status) {
  switch ((status || '').toLowerCase()) {
    case 'passed':     return '✅';
    case 'failed':     return '❌';
    case 'skipped':
    case 'pending':    return '⏭️';
    case 'undefined':
    case 'ambiguous':  return '⚠️';
    default:           return '❓';
  }
}

function msToHuman(ms) {
  if (ms == null || isNaN(ms) || ms === 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

/** GitHub-style anchor from heading text */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stepDurationMs(step) {
  const d = step.result?.duration;
  if (d == null) return 0;
  // Cucumber-JS classic JSON: duration is in nanoseconds
  // Some runners already use ms — heuristic: if > 1e10 treat as ns
  return d > 1e10 ? d / 1e6 : d;
}

function getScenarioStatus(scenario) {
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

function scenarioDurationMs(scenario) {
  return (scenario.steps || []).reduce((sum, s) => sum + stepDurationMs(s), 0);
}

// ── collect ──────────────────────────────────────────────────────────

function collect(features) {
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
        feature: feature.name || path.basename(feature.uri || 'Feature'),
        uri: feature.uri || '',
        scenarios,
      });
    }
  }

  return { stats, tree };
}

// ── render ───────────────────────────────────────────────────────────

function renderGlobalSummary(stats) {
  const overall = stats.failed > 0 || stats.ambiguous > 0 || stats.undefined > 0
    ? '❌ Failed'
    : '✅ Passed';

  const duration = msToHuman(stats.duration);

  let md = `### Cucumber Results — ${overall}\n\n`;
  md += `| Status | Count |\n|--------|------:|\n`;
  md += `| ✅ Passed | ${stats.passed} |\n`;
  md += `| ❌ Failed | ${stats.failed} |\n`;
  md += `| ⏭️ Skipped / Pending | ${stats.skipped + stats.pending} |\n`;
  if (stats.undefined) md += `| ⚠️ Undefined | ${stats.undefined} |\n`;
  if (stats.ambiguous) md += `| ⚠️ Ambiguous | ${stats.ambiguous} |\n`;
  md += `| **Total** | **${stats.total}** |\n`;
  if (duration) md += `\n⏱ **Duration:** ${duration}\n`;
  md += `\n---\n\n`;
  return md;
}

function renderIndex(tree) {
  let md = `### Index\n\n`;

  for (const { feature, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    const featureFailed = scenarios.some(s => s.status === 'failed');
    const featureIcon = featureFailed ? '❌' : '✅';

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

function renderSteps(scenario) {
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

    body += `${icon} **${escapeHtml(keyword)}** ${escapeHtml(name)}${durSuffix}\n`;

    if (status === 'failed' && step.result?.error_message) {
      const err = step.result.error_message.trim().slice(0, 4000);
      body += `\n\`\`\`\n${err}\n\`\`\`\n`;
    }
  }
  return body;
}

function renderFeatures(tree) {
  let md = '';

  for (const { feature, uri, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    // Explicit HTML anchor so index links are reliable
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

      // Collapsible steps
      md += `<details>\n<summary>Steps</summary>\n\n`;
      md += renderSteps(scenario);
      md += `\n</details>\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

function buildMarkdown(features) {
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
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.error(`Wrote ${outputPath}`);
}

process.stdout.write(markdown);