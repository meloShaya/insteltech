import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const SUPABASE_URL = window.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.VITE_SUPABASE_ANON_KEY || "";
const ATTACHMENTS_BUCKET = "mail-attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const ATTACHMENT_CONTENT_TYPES = Object.freeze({
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
});

const elements = {
  authScreen: document.getElementById("auth-screen"),
  appScreen: document.getElementById("app-screen"),
  loginForm: document.getElementById("login-form"),
  loginStatus: document.getElementById("login-status"),
  mfaForm: document.getElementById("mfa-form"),
  mfaCode: document.getElementById("mfa-code"),
  mfaStatus: document.getElementById("mfa-status"),
  currentUser: document.getElementById("current-user"),
  signOut: document.getElementById("sign-out"),
  composeButton: document.getElementById("compose-button"),
  composeDialog: document.getElementById("compose-dialog"),
  composeForm: document.getElementById("compose-form"),
  closeCompose: document.getElementById("close-compose"),
  composeTo: document.getElementById("compose-to"),
  composeSubject: document.getElementById("compose-subject"),
  composeBody: document.getElementById("compose-body"),
  composeAttachments: document.getElementById("compose-attachments"),
  composeStatus: document.getElementById("compose-status"),
  sendButton: document.getElementById("send-button"),
  threadSearch: document.getElementById("thread-search"),
  refreshButton: document.getElementById("refresh-button"),
  threadList: document.getElementById("thread-list"),
  threadEmpty: document.getElementById("thread-empty"),
  messagePlaceholder: document.getElementById("message-placeholder"),
  messageContent: document.getElementById("message-content"),
  activeSubject: document.getElementById("active-subject"),
  activeReply: document.getElementById("active-reply"),
  messageList: document.getElementById("message-list"),
  toast: document.getElementById("toast"),
};

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

let session = null;
let currentUser = null;
let threads = [];
let activeThreadId = null;
let activeThread = null;
let activeMessages = [];
let replyTarget = null;
let toastTimer = null;
let mfaFactorId = null;
let mfaChallengeId = null;

function setStatus(element, message, kind = "error") {
  element.textContent = message || "";
  element.classList.toggle("success", kind === "success");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4500);
}

function asList(value) {
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function parseRecipients(value) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function safeFilename(filename) {
  const value = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return value || "attachment.pdf";
}

function attachmentContentType(filename) {
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return ATTACHMENT_CONTENT_TYPES[extension] || null;
}

async function invokeErrorMessage(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // Keep the SDK's message when the response body has already been consumed.
    }
  }
  return error?.message || "The mail request failed";
}

function activeMemberMessage() {
  return "Your account is not enabled for the InstelTech mail portal.";
}

function showLoginMode() {
  elements.loginForm.hidden = false;
  elements.mfaForm.hidden = true;
  setStatus(elements.mfaStatus, "");
}

async function requireMfaIfNeeded() {
  if (!supabase) return false;

  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    setStatus(
      elements.loginStatus,
      error.message || "Could not verify account security",
    );
    return false;
  }
  if (data.currentLevel === "aal2" || data.nextLevel !== "aal2") return true;

  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  const factor = factors?.all?.find(
    (item) => item.factor_type === "totp" && item.status === "verified",
  );
  if (factorsError || !factor) {
    setStatus(
      elements.loginStatus,
      "MFA setup is required for this account before accessing mail.",
    );
    return false;
  }

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
  if (challengeError || !challenge) {
    setStatus(
      elements.loginStatus,
      challengeError?.message || "Could not start MFA verification",
    );
    return false;
  }

  mfaFactorId = factor.id;
  mfaChallengeId = challenge.id;
  elements.loginForm.hidden = true;
  elements.mfaForm.hidden = false;
  setStatus(elements.loginStatus, "");
  setStatus(elements.mfaStatus, "");
  elements.mfaCode.focus();
  return false;
}

async function applySession(nextSession) {
  session = nextSession;
  currentUser = session?.user ?? null;
  elements.authScreen.hidden = Boolean(currentUser);
  elements.appScreen.hidden = !currentUser;

  if (!currentUser) {
    showLoginMode();
    activeThreadId = null;
    activeThread = null;
    activeMessages = [];
    return;
  }

  const mfaReady = await requireMfaIfNeeded();
  if (!mfaReady) {
    elements.authScreen.hidden = false;
    elements.appScreen.hidden = true;
    return;
  }

  elements.currentUser.textContent =
    currentUser.email || "Signed-in team member";
  await loadThreads();
}

async function loadThreads() {
  if (!supabase || !currentUser) return;

  elements.refreshButton.disabled = true;
  try {
    const { data, error } = await supabase
      .from("mail_threads")
      .select("id, subject, normalized_subject, last_message_at, created_at")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    threads = data || [];
    renderThreads();
    if (
      activeThreadId &&
      !threads.some((thread) => thread.id === activeThreadId)
    ) {
      clearActiveThread();
    }
  } catch (error) {
    showToast(error.message || "Could not load the inbox");
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function renderThreads() {
  const search = elements.threadSearch.value.trim().toLowerCase();
  const filtered = threads.filter(
    (thread) =>
      !search || (thread.subject || "").toLowerCase().includes(search),
  );

  elements.threadList.replaceChildren();
  elements.threadEmpty.hidden = filtered.length > 0;

  for (const thread of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thread-row${thread.id === activeThreadId ? " active" : ""}`;
    button.addEventListener("click", () => void openThread(thread.id));

    const subject = document.createElement("span");
    subject.className = "thread-row-title";
    subject.textContent = thread.subject || "(no subject)";

    const date = document.createElement("span");
    date.className = "thread-row-date";
    date.textContent = formatDate(thread.last_message_at);

    button.append(subject, date);
    elements.threadList.append(button);
  }
}

function clearActiveThread() {
  activeThreadId = null;
  activeThread = null;
  activeMessages = [];
  elements.messagePlaceholder.hidden = false;
  elements.messageContent.hidden = true;
  elements.messageList.replaceChildren();
  renderThreads();
}

async function openThread(threadId) {
  if (!supabase || !currentUser) return;
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;

  activeThreadId = threadId;
  activeThread = thread;
  renderThreads();
  elements.messagePlaceholder.hidden = true;
  elements.messageContent.hidden = false;
  elements.activeSubject.textContent = thread.subject || "(no subject)";
  elements.activeReply.disabled = true;
  elements.messageList.replaceChildren();

  const { data: messages, error: messageError } = await supabase
    .from("mail_messages")
    .select(
      "id, thread_id, direction, internet_message_id, in_reply_to, references_header, from_address, to_addresses, cc_addresses, bcc_addresses, subject, text_body, status, error_message, sent_at, created_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (messageError) {
    showToast(messageError.message || "Could not load this conversation");
    return;
  }

  const messageIds = (messages || []).map((message) => message.id);
  let attachments = [];
  if (messageIds.length > 0) {
    const { data, error } = await supabase
      .from("mail_attachments")
      .select("id, message_id, storage_path, filename, content_type, byte_size")
      .in("message_id", messageIds);
    if (error) {
      showToast(error.message || "Could not load attachments");
      return;
    }
    attachments = data || [];
  }

  const attachmentsByMessage = new Map();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.message_id) || [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.message_id, list);
  }

  activeMessages = (messages || []).map((message) => ({
    ...message,
    to_addresses: asList(message.to_addresses),
    cc_addresses: asList(message.cc_addresses),
    bcc_addresses: asList(message.bcc_addresses),
    attachments: attachmentsByMessage.get(message.id) || [],
  }));
  elements.activeReply.disabled = activeMessages.length === 0;
  renderMessages();
}

function renderMessages() {
  elements.messageList.replaceChildren();

  for (const message of activeMessages) {
    const card = document.createElement("article");
    card.className = `message-card ${message.direction}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const address = document.createElement("div");
    address.className = "message-address";
    const sender = document.createElement("strong");
    sender.textContent =
      message.direction === "inbound"
        ? message.from_address
        : "InstelTech Marketing <marketing@insteltech.co.zw>";
    const recipient = document.createElement("span");
    recipient.textContent =
      message.direction === "inbound"
        ? `To: ${asList(message.to_addresses).join(", ")}`
        : `To: ${asList(message.to_addresses).join(", ")}`;
    address.append(sender, recipient);

    const date = document.createElement("time");
    date.className = "message-date";
    date.dateTime = message.created_at || "";
    date.textContent = formatDate(message.created_at);
    meta.append(address, date);

    const body = document.createElement("pre");
    body.className = "message-body";
    body.textContent =
      message.text_body || "(This message has no plain-text body.)";

    card.append(meta, body);

    if (
      message.status &&
      message.status !== "received" &&
      message.status !== "sent"
    ) {
      const status = document.createElement("p");
      status.className = "form-status";
      status.textContent = `Status: ${message.status}${message.error_message ? ` — ${message.error_message}` : ""}`;
      card.append(status);
    }

    if (message.attachments.length > 0) {
      const attachmentList = document.createElement("div");
      attachmentList.className = "attachment-list";
      for (const attachment of message.attachments) {
        const link = document.createElement("a");
        link.className = "attachment-link";
        link.href = "#";
        link.textContent = `↧ ${attachment.filename}`;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          void openAttachment(
            link,
            attachment.storage_path,
            attachment.filename,
          );
        });
        attachmentList.append(link);
      }
      card.append(attachmentList);
    }

    const actions = document.createElement("div");
    actions.className = "message-actions";
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "secondary-button";
    reply.textContent = "Reply";
    reply.addEventListener("click", () => openCompose(message));
    actions.append(reply);
    card.append(actions);

    elements.messageList.append(card);
  }
}

async function openAttachment(link, storagePath, filename) {
  if (!supabase) return;
  link.textContent = "Opening...";
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 600);
  if (error || !data?.signedUrl) {
    link.textContent = "Attachment unavailable";
    showToast(error?.message || "Could not open attachment");
    return;
  }
  link.textContent = `↧ ${filename}`;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function replySubject(subject) {
  const value = subject || "(no subject)";
  return /^re:\s/i.test(value) ? value : `Re: ${value}`;
}

function openCompose(message = null) {
  replyTarget = message;
  setStatus(elements.composeStatus, "");
  elements.composeForm.reset();
  elements.composeSubject.value = message
    ? replySubject(activeThread?.subject)
    : "";

  if (message) {
    const recipient =
      message.direction === "inbound"
        ? message.from_address
        : asList(message.to_addresses)[0] || "";
    elements.composeTo.value = recipient;
  }

  if (typeof elements.composeDialog.showModal === "function") {
    elements.composeDialog.showModal();
  } else {
    elements.composeDialog.setAttribute("open", "");
  }
  elements.composeTo.focus();
}

function closeCompose() {
  if (typeof elements.composeDialog.close === "function") {
    elements.composeDialog.close();
  } else {
    elements.composeDialog.removeAttribute("open");
  }
  replyTarget = null;
  setStatus(elements.composeStatus, "");
}

async function uploadAttachments(files) {
  if (!supabase || !currentUser) throw new Error(activeMemberMessage());
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`You can attach at most ${MAX_ATTACHMENTS} files`);
  }

  let totalBytes = 0;
  const uploaded = [];
  for (const file of files) {
    const filename = safeFilename(file.name);
    const contentType = attachmentContentType(filename);
    if (!contentType) {
      throw new Error(`This file format is not supported: ${filename}`);
    }
    totalBytes += file.size;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachments exceed the 25 MB total limit");
    }

    const path = `outgoing/${currentUser.id}/${crypto.randomUUID()}-${filename}`;
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType, upsert: false });
    if (error) throw error;
    uploaded.push({
      path,
      filename,
      content_type: contentType,
      byte_size: file.size,
    });
  }
  return uploaded;
}

async function sendCompose(event) {
  event.preventDefault();
  if (!supabase || !currentUser) return;

  const to = parseRecipients(elements.composeTo.value);
  const subject = elements.composeSubject.value.trim();
  const text = elements.composeBody.value.trim();
  const files = Array.from(elements.composeAttachments.files || []);
  if (to.length === 0 || !subject || !text) {
    setStatus(
      elements.composeStatus,
      "Recipient, subject, and message are required.",
    );
    return;
  }

  elements.sendButton.disabled = true;
  setStatus(elements.composeStatus, "Preparing message...");
  try {
    const attachments = await uploadAttachments(files);
    const references = [
      replyTarget?.references_header,
      replyTarget?.internet_message_id,
    ]
      .filter(Boolean)
      .join(" ");

    const { data, error } = await supabase.functions.invoke("mail-send", {
      body: {
        to,
        subject,
        text,
        thread_id: replyTarget ? activeThreadId : undefined,
        client_send_id: crypto.randomUUID(),
        in_reply_to: replyTarget?.internet_message_id || undefined,
        references: references || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    });
    if (error) throw new Error(await invokeErrorMessage(error));

    closeCompose();
    showToast(
      data?.duplicate
        ? "This email was already sent."
        : "Email sent successfully.",
    );
    await loadThreads();
    if (data?.thread_id) await openThread(data.thread_id);
  } catch (error) {
    setStatus(elements.composeStatus, error.message || "Could not send email");
  } finally {
    elements.sendButton.disabled = false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabase) {
    setStatus(
      elements.loginStatus,
      "Supabase is not configured for this site.",
    );
    return;
  }

  const form = new FormData(elements.loginForm);
  setStatus(elements.loginStatus, "Signing in...");
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || ""),
  });
  if (error) {
    setStatus(elements.loginStatus, error.message || "Could not sign in");
    return;
  }
  setStatus(elements.loginStatus, "");
}

async function handleMfa(event) {
  event.preventDefault();
  if (!supabase || !mfaFactorId || !mfaChallengeId) return;

  const code = elements.mfaCode.value.trim();
  if (!/^[0-9]{6}$/.test(code)) {
    setStatus(elements.mfaStatus, "Enter the six-digit verification code.");
    return;
  }

  setStatus(elements.mfaStatus, "Verifying...");
  const { error } = await supabase.auth.mfa.verify({
    factorId: mfaFactorId,
    challengeId: mfaChallengeId,
    code,
  });
  if (error) {
    setStatus(elements.mfaStatus, error.message || "Invalid verification code");
    return;
  }

  mfaFactorId = null;
  mfaChallengeId = null;
  elements.mfaCode.value = "";
  const { data } = await supabase.auth.getSession();
  await applySession(data.session);
}

async function init() {
  if (!supabase) {
    setStatus(elements.loginStatus, "Mail portal configuration is missing.");
    return;
  }

  elements.loginForm.addEventListener(
    "submit",
    (event) => void handleLogin(event),
  );
  elements.mfaForm.addEventListener("submit", (event) => void handleMfa(event));
  elements.signOut.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });
  elements.composeButton.addEventListener("click", () => openCompose());
  elements.closeCompose.addEventListener("click", closeCompose);
  elements.composeForm.addEventListener(
    "submit",
    (event) => void sendCompose(event),
  );
  elements.threadSearch.addEventListener("input", renderThreads);
  elements.refreshButton.addEventListener("click", () => void loadThreads());
  elements.activeReply.addEventListener("click", () => {
    const lastInbound = [...activeMessages]
      .reverse()
      .find((message) => message.direction === "inbound");
    openCompose(lastInbound || activeMessages.at(-1) || null);
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setStatus(
      elements.loginStatus,
      error.message || "Could not start the mail portal",
    );
    return;
  }
  await applySession(data.session);

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => void applySession(nextSession), 0);
  });
}

void init();
