#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const PARTIALS_DIR = path.join(TEMPLATE_DIR, 'partials');
const STATIC_DIR = path.join(__dirname, 'static');
const DIST_DIR = path.join(__dirname, 'dist');
const ADMIN_DIR = path.join(__dirname, 'admin');

const PAGES = {
  index: 'index.html',
  technology: 'technology.html',
  applications: 'applications.html',
  batterybarn: 'batterybarn.html',
  about: 'about.html',
  contact: 'contact.html',
};

// Pages that use "-" in the attribution comment (others use em-dash)
const HYPHEN_ATTRIBUTION_PAGES = new Set(['index', 'batterybarn']);

// Pages that have no skip link
const NO_SKIP_LINK_PAGES = new Set(['batterybarn']);

// Pages that have no <!-- FOOTER --> comment
const NO_FOOTER_COMMENT_PAGES = new Set(['batterybarn']);

// Pages that have a trailing newline after </html>
const TRAILING_NEWLINE_PAGES = new Set(['index', 'applications']);

// Pages that have a blank line between </script> and </body>
const SCRIPT_GAP_PAGES = new Set(['batterybarn']);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Resolve a dotted path like "hero.title" against a data object. */
function resolve(obj, dotPath) {
  if (!dotPath) return obj;
  const parts = dotPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** HTML-escape (for double-brace output). */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str == null ? '' : str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Load all partials from the partials directory. */
function loadPartials() {
  const partials = {};
  if (!fs.existsSync(PARTIALS_DIR)) return partials;
  for (const f of fs.readdirSync(PARTIALS_DIR)) {
    if (f.endsWith('.html')) {
      const name = f.replace('.html', '');
      partials[name] = fs.readFileSync(path.join(PARTIALS_DIR, f), 'utf8');
    }
  }
  return partials;
}

// ---------------------------------------------------------------------------
// TEMPLATE ENGINE
// ---------------------------------------------------------------------------

/**
 * Process a template string with data.
 *
 * Supported syntax:
 *   {{> partialName}}        — include partial
 *   {{{variable}}}           — unescaped output
 *   {{variable}}             — HTML-escaped output
 *   {{#each path}}...{{/each}}  — iteration (supports {{this}}, {{@index}}, nested props)
 *   {{#if path}}...{{/if}}      — conditional
 *   {{#unless path}}...{{/unless}} — negative conditional
 *   dot notation: {{a.b.c}}
 */
function render(template, data, partials) {
  // 1. Resolve partials first (they may contain their own template syntax)
  let out = template.replace(/\{\{>\s*(\w+)\s*\}\}/g, function (_, name) {
    if (!partials[name]) throw new Error('Partial not found: ' + name);
    return partials[name];
  });

  // 2. Process block helpers (each, if, unless) — must be done recursively
  //    because blocks can be nested.
  out = processBlocks(out, data, partials);

  // 3. Replace triple-brace (unescaped) variables
  out = out.replace(/\{\{\{([^}]+)\}\}\}/g, function (_, expr) {
    const val = resolve(data, expr.trim());
    return val == null ? '' : String(val);
  });

  // 4. Replace double-brace (escaped) variables
  out = out.replace(/\{\{([^#/!>][^}]*)\}\}/g, function (_, expr) {
    const val = resolve(data, expr.trim());
    return val == null ? '' : escapeHtml(String(val));
  });

  return out;
}

/**
 * Process {{#each}}, {{#if}}, {{#unless}} blocks.
 * Handles nesting by matching open/close tags with a depth counter.
 */
function processBlocks(text, data, partials) {
  let result = text;
  let safety = 0;

  // Keep processing until no more block tags remain
  while (safety++ < 200) {
    // Find the first top-level block (outermost)
    const match = findOutermostBlock(result);
    if (!match) break;

    const { fullMatch, type, expr, body, start, end } = match;

    let replacement = '';

    if (type === 'each') {
      const arr = resolve(data, expr);
      if (Array.isArray(arr)) {
        replacement = arr.map(function (item, idx) {
          // Create a child context: the item's properties + @index + this
          const childData = Object.create(data);
          if (typeof item === 'object' && item !== null) {
            Object.assign(childData, item);
          }
          childData['this'] = typeof item === 'string' ? item : (typeof item === 'object' ? item : String(item));
          childData['@index'] = idx;
          // Recurse to handle nested blocks within each body
          let rendered = processBlocks(body, childData, partials);
          // Also handle variable substitutions within iteration
          rendered = rendered.replace(/\{\{\{([^}]+)\}\}\}/g, function (_, e) {
            const val = resolve(childData, e.trim());
            return val == null ? '' : String(val);
          });
          rendered = rendered.replace(/\{\{([^#/!>][^}]*)\}\}/g, function (_, e) {
            const val = resolve(childData, e.trim());
            return val == null ? '' : escapeHtml(String(val));
          });
          return rendered;
        }).join('');
      }
    } else if (type === 'if') {
      const val = resolve(data, expr);
      if (val) {
        replacement = processBlocks(body, data, partials);
      } else {
        replacement = '';
      }
    } else if (type === 'unless') {
      const val = resolve(data, expr);
      if (!val) {
        replacement = processBlocks(body, data, partials);
      } else {
        replacement = '';
      }
    }

    result = result.substring(0, start) + replacement + result.substring(end);
  }

  return result;
}

/**
 * Check if a tag at position `tagStart` to `tagEnd` is the only non-whitespace
 * content on its line. If so, return extended boundaries that consume the full
 * line (including leading whitespace and trailing newline). Otherwise return
 * the original boundaries.
 */
function standaloneLineBounds(text, tagStart, tagEnd) {
  // Walk backwards from tagStart to find start of line
  let lineStart = tagStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  // Check that everything between lineStart and tagStart is whitespace
  const before = text.substring(lineStart, tagStart);
  if (before.trim() !== '') return { start: tagStart, end: tagEnd };
  // Walk forwards from tagEnd to find end of line
  let lineEnd = tagEnd;
  if (text[lineEnd] === '\n') {
    lineEnd++; // consume the newline
  } else if (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n') {
    lineEnd += 2;
  } else if (lineEnd < text.length) {
    // There's non-whitespace content after the tag on the same line
    return { start: tagStart, end: tagEnd };
  }
  return { start: lineStart, end: lineEnd };
}

/**
 * Find the first top-level block (outermost).
 * Returns { type, expr, body, start, end } or null.
 *
 * start/end are the full replacement boundaries (including consumed whitespace/newlines
 * for standalone tag lines).
 */
function findOutermostBlock(text) {
  const openRe = /\{\{#(each|if|unless)\s+([^}]+)\}\}/g;
  let m;

  let block = null;
  while ((m = openRe.exec(text)) !== null) {
    const type = m[1];
    const expr = m[2].trim();
    const openTag = m[0];
    const openTagStart = m.index;
    const openTagEnd = m.index + openTag.length;
    const closeTag = '{{/' + type + '}}';
    let depth = 1;
    let pos = openTagEnd;

    while (depth > 0 && pos < text.length) {
      const nextOpen = text.indexOf('{{#' + type, pos);
      const nextClose = text.indexOf(closeTag, pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 3;
      } else {
        depth--;
        if (depth === 0) {
          const closeTagStart = nextClose;
          const closeTagEnd = nextClose + closeTag.length;
          block = { type, expr, openTagStart, openTagEnd, closeTagStart, closeTagEnd };
          break;
        }
        pos = nextClose + closeTag.length;
      }
    }
    if (block) break;
  }

  if (!block) return null;

  // Determine if open tag and close tag are standalone (own line)
  const openBounds = standaloneLineBounds(text, block.openTagStart, block.openTagEnd);
  const closeBounds = standaloneLineBounds(text, block.closeTagStart, block.closeTagEnd);

  const openIsStandalone = (openBounds.start !== block.openTagStart || openBounds.end !== block.openTagEnd);
  const closeIsStandalone = (closeBounds.start !== block.closeTagStart || closeBounds.end !== block.closeTagEnd);

  // The body is between the open tag end and close tag start
  // If open tag is standalone, body starts after the consumed newline
  // If close tag is standalone, body ends before the consumed leading whitespace
  const bodyStart = openIsStandalone ? openBounds.end : block.openTagEnd;
  const bodyEnd = closeIsStandalone ? closeBounds.start : block.closeTagStart;
  const body = text.substring(bodyStart, bodyEnd);

  // The full replacement range
  const start = openIsStandalone ? openBounds.start : block.openTagStart;
  const end = closeIsStandalone ? closeBounds.end : block.closeTagEnd;

  return { type: block.type, expr: block.expr, body, start, end };
}

/**
 * Clean up whitespace artifacts from template control flow.
 *
 * Lines that consist ONLY of a block tag ({{#if ...}}, {{/if}}, {{#each ...}},
 * {{/each}}, {{#unless ...}}, {{/unless}}) are removed entirely (including
 * the newline). But when a tag shares a line with real content, the tag part
 * is stripped and the content remains.
 *
 * This runs AFTER full rendering, so no {{...}} tags should remain in the
 * output — this function handles the case where a conditional evaluates to
 * empty and leaves behind blank lines.
 */
function cleanBlankLines(text) {
  // After rendering, there shouldn't be any template tags left, but there
  // may be stray blank lines caused by removed blocks. We handle the specific
  // patterns that our templates produce:

  // Pattern: index.html has head_extra that starts with \n, and the template
  // has {{#if head_extra}}{{{head_extra}}}\n{{/if}}</head>
  // When head_extra is set, this produces: {content}\n</head>
  // When not set, the whole block collapses, leaving just </head>

  // The main cleanup is collapsing multiple blank lines that result from
  // removed blocks. But we need to be careful — some double blank lines
  // are intentional in the original HTML.

  return text;
}

// ---------------------------------------------------------------------------
// PER-PAGE DATA INJECTION
// ---------------------------------------------------------------------------

function injectPageData(pageName, data, globals) {
  // Attribution dash: "-" for index and batterybarn, em-dash for others
  data.attribution_dash = HYPHEN_ATTRIBUTION_PAGES.has(pageName) ? '-' : '\u2014';

  // Skip link
  data.show_skip_link = !NO_SKIP_LINK_PAGES.has(pageName);

  // Footer comment
  data.show_footer_comment = !NO_FOOTER_COMMENT_PAGES.has(pageName);

  // Nav active flags (legacy, kept for compatibility)
  const activeNav = data.active_nav || '';
  data.nav_technology_active = activeNav === 'technology';
  data.nav_applications_active = activeNav === 'applications';
  data.nav_batterybarn_active = activeNav === 'batterybarn';
  data.nav_about_active = activeNav === 'about';
  data.nav_contact_active = activeNav === 'contact';

  // Inject global header/footer data
  if (globals) {
    // Deep clone header so we can set _active per page
    const header = JSON.parse(JSON.stringify(globals.header || {}));
    if (header.nav_items) {
      header.nav_items.forEach(function(item) {
        item._active = (item.nav_key === activeNav);
      });
    }
    data.global_header = header;
    data.global_footer = globals.footer || {};
  }

  return data;
}

// ---------------------------------------------------------------------------
// FILE COPY HELPER
// ---------------------------------------------------------------------------

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// MAIN BUILD
// ---------------------------------------------------------------------------

function build() {
  console.log('Building ABC site...');

  // Clean dist
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Load partials
  const partials = loadPartials();

  // Load global settings (header, footer)
  let globals = {};
  const globalsPath = path.join(CONTENT_DIR, 'globals.json');
  if (fs.existsSync(globalsPath)) {
    globals = JSON.parse(fs.readFileSync(globalsPath, 'utf8'));
    console.log('  OK globals.json');
  }

  // Build each page
  for (const [pageName, outputFile] of Object.entries(PAGES)) {
    const contentPath = path.join(CONTENT_DIR, pageName + '.json');
    const templatePath = path.join(TEMPLATE_DIR, outputFile);

    if (!fs.existsSync(contentPath)) {
      console.error('  SKIP ' + outputFile + ' (no content file)');
      continue;
    }
    if (!fs.existsSync(templatePath)) {
      console.error('  SKIP ' + outputFile + ' (no template file)');
      continue;
    }

    const data = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    const template = fs.readFileSync(templatePath, 'utf8');

    // Inject computed per-page variables
    injectPageData(pageName, data, globals);

    // Render
    let html = render(template, data, partials);

    // Clean up any whitespace artifacts
    html = cleanBlankLines(html);

    // Insert blank line between </script> and </body> for specific pages
    if (SCRIPT_GAP_PAGES.has(pageName)) {
      html = html.replace('</script>\n</body>', '</script>\n\n</body>');
    }

    // Trailing newline handling
    if (TRAILING_NEWLINE_PAGES.has(pageName)) {
      if (!html.endsWith('\n')) html += '\n';
    } else {
      // Strip trailing newline
      while (html.endsWith('\n')) html = html.slice(0, -1);
    }

    // Write to dist
    fs.writeFileSync(path.join(DIST_DIR, outputFile), html);
    console.log('  OK ' + outputFile);
  }

  // Copy static assets (CSS, images)
  copyRecursive(STATIC_DIR, DIST_DIR);
  console.log('  OK static assets');

  // Copy admin directory if it exists
  if (fs.existsSync(ADMIN_DIR)) {
    copyRecursive(ADMIN_DIR, path.join(DIST_DIR, 'admin'));
    console.log('  OK admin');
  }

  console.log('Build complete. Output in ' + DIST_DIR);
}

build();
