import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';

const ROOT_DIR = process.cwd();
const EMAILS_DIR = 'emails';
const DEFAULT_EMAIL_NAME = 'default';
const TEMPLATE_FILE = 'index.html';
const RECIPIENTS_FILE = 'recipients.json';
const DATA_FILE = 'data.json';
const ASSETS_DIR = 'assets';
const ATTACHMENTS_DIR = 'attachments';
const IGNORED_ATTACHMENT_FILES = new Set([
  '.DS_Store',
  '.gitkeep',
  'Thumbs.db',
  'desktop.ini'
]);
const yellow = (value) => `\x1b[33m${value}\x1b[0m`;
const green = (value) => `\x1b[32m${value}\x1b[0m`;
const red = (value) => `\x1b[31m${value}\x1b[0m`;
const args = parseArgs(process.argv.slice(2));

class GmailHtmlMailer {
  static async run(options) {
    const gmailUser = requiredEnv('GMAIL_USER');
    const appPassword = requiredEnv('GMAIL_APP_PASSWORD');
    const fromName = process.env.MAIL_FROM_NAME || gmailUser;
    const emailDir = resolveEmailDir(options.email || options.emailDir || DEFAULT_EMAIL_NAME);
    const templatePath = resolvePath(options.template, emailDir, TEMPLATE_FILE);
    const data = await loadData(options, emailDir);
    const subject = data.subject;
    const recipients = await loadRecipients(options, emailDir);
    const requestedDelaySeconds = Number(options.delay || options.delaySeconds || 0);
    const delaySeconds = requestedDelaySeconds > 0 ? requestedDelaySeconds : 0;

    if (!subject) {
      throw new Error(`Missing subject in ${path.join(emailDir, DATA_FILE)}.`);
    }

    if (recipients.length === 0) {
      throw new Error(`No recipients found. Use --to email@example.com or edit ${path.join(emailDir, RECIPIENTS_FILE)}.`);
    }

    const template = await fs.readFile(templatePath, 'utf8');
    const inlineAssets = await filesAsAttachments(resolvePath(options.assets, emailDir, ASSETS_DIR), true);
    const fileAttachments = await filesAsAttachments(resolvePath(options.attachments, emailDir, ATTACHMENTS_DIR), false);

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: appPassword
      }
    });

    await transporter.verify();

    console.log(`Sending "${subject}" to ${recipients.length} recipient(s) from ${path.relative(ROOT_DIR, emailDir)}`);
    console.log('');

    let hasFailedEmails = false;

    for (const [index, recipient] of recipients.entries()) {
      const iteration = String(index + 1).padStart(4, '0');
      const recipientLabel = recipient.name
        ? `${recipient.email} (${recipient.name})`
        : recipient.email;
      console.log(`${yellow(iteration)}: Sending to ${recipientLabel}...`);

      const html = renderTemplate(template, {
        ...data,
        subject,
        recipientEmail: recipient.email,
        recipientName: recipient.name || recipient.email
      });
      const text = renderPlainText(html);

      try {
        await transporter.sendMail({
          from: `"${escapeHeader(fromName)}" <${gmailUser}>`,
          to: recipient.email,
          subject,
          html,
          text,
          attachments: [...inlineAssets, ...fileAttachments]
        });
        console.log(`Sent ${green('SUCCESS')}`);
      } catch {
        hasFailedEmails = true;
        console.log(`Sent ${red('FAIL')}`);
      }

      if (delaySeconds > 0 && recipient !== recipients.at(-1)) {
        console.log(`Waiting ${delaySeconds} second(s)...`);
        await sleep(delaySeconds * 1000);
      }

      if (recipient !== recipients.at(-1)) {
        console.log('');
      }
    }

    if (hasFailedEmails) {
      process.exitCode = 1;
    }
  }
}

GmailHtmlMailer.run(args).catch((error) => {
  console.error(`\nSend failed: ${error.message}`);
  process.exitCode = 1;
});

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    parsed[toCamelCase(rawKey)] = value;
  }

  return parsed;
}

async function loadRecipients(options, emailDir) {
  if (options.to) {
    return options.to
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
  }

  const recipientsPath = resolvePath(options.recipients, emailDir, RECIPIENTS_FILE);
  const raw = await fs.readFile(recipientsPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Recipients file must contain a JSON array.');
  }

  return parsed.map((item) => {
    if (typeof item === 'string') {
      return { email: item };
    }

    if (!item?.email) {
      throw new Error('Each recipient object must include an email field.');
    }

    return item;
  });
}

async function loadData(options, emailDir) {
  const dataPath = resolvePath(options.data, emailDir, DATA_FILE);

  try {
    const raw = await fs.readFile(dataPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Data file must contain a JSON object.');
    }

    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function filesAsAttachments(directoryPath, inline) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && !isIgnoredAttachmentFile(entry.name))
      .map((entry) => {
        const filePath = path.join(directoryPath, entry.name);
        const attachment = {
          filename: entry.name,
          path: filePath
        };

        if (inline) {
          attachment.cid = entry.name;
        }

        return attachment;
      });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function isIgnoredAttachmentFile(fileName) {
  return fileName.startsWith('.') || IGNORED_ATTACHMENT_FILES.has(fileName);
}

function renderTemplate(template, values) {
  return template.replaceAll(/{{\s*([\w.-]+)\s*}}/g, (_match, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function renderPlainText(html) {
  return html
    .replaceAll(/<head[\s\S]*?<\/head>/gi, '')
    .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
    .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<div\b[^>]*display\s*:\s*none[\s\S]*?<\/div>/gi, '')
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<\/(p|div|td|tr|table|h[1-6])>/gi, '\n')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/&nbsp;/g, ' ')
    .replaceAll(/&amp;/g, '&')
    .replaceAll(/&lt;/g, '<')
    .replaceAll(/&gt;/g, '>')
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&#39;/g, "'")
    .replaceAll(/[ \t]+\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveFromRoot(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(ROOT_DIR, relativeOrAbsolutePath);
}

function resolveEmailDir(emailNameOrPath) {
  if (path.isAbsolute(emailNameOrPath) || emailNameOrPath.includes('/')) {
    return resolveFromRoot(emailNameOrPath);
  }

  return path.join(ROOT_DIR, EMAILS_DIR, emailNameOrPath);
}

function resolvePath(customPath, baseDir, fallbackName) {
  if (customPath) {
    return resolveFromRoot(customPath);
  }

  return path.join(baseDir, fallbackName);
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }

  return value;
}

function toCamelCase(value) {
  return value.replaceAll(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function escapeHeader(value) {
  return String(value).replaceAll('"', '\\"');
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
