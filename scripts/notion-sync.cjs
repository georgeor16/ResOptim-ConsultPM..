const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PAGE_IDS = JSON.parse(process.env.NOTION_PAGE_IDS);

function getChangedDocFiles() {
  const output = execSync("git diff --name-only HEAD~1 HEAD -- docs/").toString();
  return output
    .split("\n")
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/^docs\//, "").replace(/\.md$/, ""));
}

function markdownToNotionBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  for (const line of lines) {
    if (line.startsWith("# ")) blocks.push(heading(line.slice(2), 1));
    else if (line.startsWith("## ")) blocks.push(heading(line.slice(3), 2));
    else if (line.startsWith("### ")) blocks.push(heading(line.slice(4), 3));
    else if (line.startsWith("- ") || line.startsWith("* ")) blocks.push(bulletItem(line.slice(2)));
    else if (/^\d+\. /.test(line)) blocks.push(numberedItem(line.replace(/^\d+\. /, "")));
    else if (line.startsWith("```")) blocks.push(divider());
    else if (line.startsWith("|")) blocks.push(paragraph(line));
    else if (line.trim() === "---") blocks.push(divider());
    else if (line.trim() !== "") blocks.push(paragraph(line));
  }
  return blocks;
}

// Parses text with backtick code spans into a Notion rich_text array
function parseInlineMarkdown(text) {
  const richText = [];
  const parts = text.split(/(`[^`]+`)/);
  for (const part of parts) {
    if (part.startsWith("`") && part.endsWith("`")) {
      richText.push({ type: "text", text: { content: part.slice(1, -1) }, annotations: { code: true } });
    } else if (part) {
      richText.push({ type: "text", text: { content: part } });
    }
  }
  return richText;
}

// Converts new session markdown lines to richly-formatted Notion blocks
function parseSessionBlocks(newMarkdown) {
  const blocks = [];
  const lines = newMarkdown.split("\n");

  for (const line of lines) {
    // Title: ## Session — 2026-03-21 (optional title)
    const titleMatch = line.match(/^## Session — (\d{4}-\d{2}-\d{2})(.*)/);
    if (titleMatch) {
      const date = titleMatch[1];
      const suffix = titleMatch[2].trim();
      blocks.push({
        object: "block", type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: "Session \u2014 " }, annotations: { bold: true } },
            { type: "mention", mention: { type: "date", date: { start: date } } },
            ...(suffix ? [{ type: "text", text: { content: " " + suffix } }] : [])
          ]
        }
      });
      continue;
    }

    // Section header: - **Built:** content
    const sectionMatch = line.match(/^- \*\*(.+?):\*\*\s*(.*)/);
    if (sectionMatch) {
      const header = sectionMatch[1];
      const content = sectionMatch[2].trim();

      blocks.push({
        object: "block", type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: header + ":" }, annotations: { underline: true } }]
        }
      });

      if (content) {
        if (header === "Next session") {
          blocks.push({ object: "block", type: "to_do", to_do: { rich_text: parseInlineMarkdown(content), checked: false } });
        } else {
          blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: parseInlineMarkdown(content) } });
        }
      }
      continue;
    }

    // Sub-item (2+ space indent): "  - content"
    const subItemMatch = line.match(/^\s{2,}- (.+)/);
    if (subItemMatch) {
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: parseInlineMarkdown(subItemMatch[1]) } });
      continue;
    }

    if (line.trim() === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
    }
  }

  return blocks;
}

function getNewSessionLines() {
  const diff = execSync("git diff HEAD~1 HEAD -- docs/session-summaries.md").toString();
  return diff
    .split("\n")
    .filter(line => line.startsWith("+") && !line.startsWith("+++"))
    .map(line => line.slice(1))
    .join("\n");
}

function heading(text, level) {
  const type = `heading_${level}`;
  return { object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: text } }] } };
}
function paragraph(text) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } };
}
function bulletItem(text) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: text } }] } };
}
function numberedItem(text) {
  return { object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: [{ type: "text", text: { content: text } }] } };
}
function divider() {
  return { object: "block", type: "divider", divider: {} };
}

async function clearPage(pageId) {
  const { results } = await notion.blocks.children.list({ block_id: pageId });
  for (const block of results) {
    await notion.blocks.delete({ block_id: block.id });
  }
}

async function getPageBlocks(pageId) {
  const { results } = await notion.blocks.children.list({ block_id: pageId });
  return results;
}

async function prependToNotion(pageId, newBlocks, existingBlocks) {
  for (const block of existingBlocks) {
    await notion.blocks.delete({ block_id: block.id });
  }
  await pushToNotion(pageId, newBlocks);
  const oldBlocks = existingBlocks.map(b => ({ object: b.object, type: b.type, [b.type]: b[b.type] }));
  await pushToNotion(pageId, oldBlocks);
}

async function pushToNotion(pageId, blocks) {
  const chunkSize = 100;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    await notion.blocks.children.append({ block_id: pageId, children: chunk });
  }
}

async function main() {
  const changedFiles = getChangedDocFiles();
  if (changedFiles.length === 0) {
    console.log("No doc files changed. Nothing to sync.");
    return;
  }
  console.log("Changed doc files:", changedFiles);
  for (const docKey of changedFiles) {
    const pageId = PAGE_IDS[docKey];
    if (!pageId) {
      console.warn(`⚠️  No Notion page ID mapped for: ${docKey} — skipping.`);
      continue;
    }
    const filePath = path.join("docs", `${docKey}.md`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found: ${filePath} — skipping.`);
      continue;
    }
    const markdown = fs.readFileSync(filePath, "utf8");
    console.log(`Syncing ${docKey} → Notion page ${pageId}`);
    if (docKey === "session-summaries") {
      const newMarkdown = getNewSessionLines();
      if (!newMarkdown.trim()) {
        console.log("No new session content detected — skipping prepend.");
        continue;
      }
      const newBlocks = parseSessionBlocks(newMarkdown);
      const existingBlocks = await getPageBlocks(pageId);
      await prependToNotion(pageId, newBlocks, existingBlocks);
    } else {
      const blocks = markdownToNotionBlocks(markdown);
      await clearPage(pageId);
      await pushToNotion(pageId, blocks);
    }
    console.log(`✅  Synced: ${docKey}`);
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
