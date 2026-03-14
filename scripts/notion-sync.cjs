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
    const filePath = pin("docs", `${docKey}.md`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found: ${filePath} — skipping.`);
      continue;
    }
    const markdown = fs.readFileSync(filePath, "utf8");
    const blocks = markdownToNotionBlocks(markdown);
    console.log(`Syncing ${docKey} → Notion page ${pageId}`);
    await clearPage(pageId);
    await pushToNotion(pageId, blocks);
    console.log(`✅  Synced: ${docKey}`);
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
