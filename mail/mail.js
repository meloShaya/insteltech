import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
import {
  fetchActiveThreads,
  updateThreadDeletedAt,
} from "./mail-data.mjs";
import {
  SESSION_IDLE_TIMEOUT_MS,
  getIdleTimeoutDelay,
  getSessionActivityAt,
  isSessionIdle,
} from "./session-timeout.mjs";

const SUPABASE_URL = window.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.VITE_SUPABASE_ANON_KEY || "";
const MAIL_DISPLAY_NAME = "Instel Tech";
const ACTIVITY_STORAGE_PREFIX = "insteltech-mail:last-activity:";
const ACTIVITY_PERSIST_INTERVAL_MS = 5 * 1000;
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
  authLoading: document.getElementById("auth-loading"),
  authScreen: document.getElementById("auth-screen"),
  appScreen: document.getElementById("app-screen"),
  loginForm: document.getElementById("login-form"),
  loginStatus: document.getElementById("login-status"),
  mfaForm: document.getElementById("mfa-form"),
  mfaCode: document.getElementById("mfa-code"),
  mfaStatus: document.getElementById("mfa-status"),
  currentUser: document.getElementById("current-user"),
  userAvatar: document.getElementById("user-avatar"),
  navInboxCount: document.getElementById("nav-inbox-count"),
  signOut: document.getElementById("sign-out"),
  composeButton: document.getElementById("compose-button"),
  composeDialog: document.getElementById("compose-dialog"),
  composeForm: document.getElementById("compose-form"),
  composeFrom: document.getElementById("compose-from"),
  closeCompose: document.getElementById("close-compose"),
  composeTo: document.getElementById("compose-to"),
  composeSubject: document.getElementById("compose-subject"),
  composeBody: document.getElementById("compose-body"),
  composeAttachments: document.getElementById("compose-attachments"),
  composeStatus: document.getElementById("compose-status"),
  sendButton: document.getElementById("send-button"),
  threadSearch: document.getElementById("thread-search"),
  refreshButton: document.getElementById("refresh-button"),
  threadCount: document.getElementById("thread-count"),
  threadFilterCount: document.getElementById("thread-filter-count"),
  threadList: document.getElementById("thread-list"),
  threadEmpty: document.getElementById("thread-empty"),
  threadEmptyTitle: document.getElementById("thread-empty-title"),
  threadEmptyCopy: document.getElementById("thread-empty-copy"),
  messagePlaceholder: document.getElementById("message-placeholder"),
  messageContent: document.getElementById("message-content"),
  activeSubject: document.getElementById("active-subject"),
  activeReply: document.getElementById("active-reply"),
  activeDelete: document.getElementById("active-delete"),
  mobileThreadBack: document.getElementById("mobile-thread-back"),
  messageList: document.getElementById("message-list"),
  attachmentSummary: document.getElementById("attachment-summary"),
  deleteDialog: document.getElementById("delete-dialog"),
  deleteForm: document.getElementById("delete-form"),
  cancelDelete: document.getElementById("cancel-delete"),
  confirmDelete: document.getElementById("confirm-delete"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
  toastAction: document.getElementById("toast-action"),
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
let pendingDeleteThreadId = null;
let idleTimer = null;
let lastActivityAt = 0;
let lastPersistedActivityAt = 0;
let idleLogoutInProgress = false;

function setStatus(element, message, kind = "error") {
  element.textContent = message || "";
  element.classList.toggle("success", kind === "success");
}

function hideToast() {
  window.clearTimeout(toastTimer);
  elements.toast.hidden = true;
}

function showToast(message, action = null) {
  window.clearTimeout(toastTimer);
  elements.toastMessage.textContent = message;
  elements.toastAction.hidden = !action;
  elements.toastAction.textContent = action?.label || "Undo";
  elements.toastAction.onclick = action
    ? () => {
        hideToast();
        action.onClick();
      }
    : null;
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

function formatListDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return new Intl.DateTimeFormat(undefined, {
    ...(sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" }),
  }).format(date);
}

function initials(value, fallback = "IT") {
  const words = String(value || "")
    .replace(/<[^>]*>/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function updateMobileThreadState() {
  elements.mailLayout?.classList.toggle(
    "has-active-thread",
    Boolean(activeThreadId),
  );
}

function updateAttachmentSummary() {
  if (!elements.attachmentSummary) return;
  const files = Array.from(elements.composeAttachments.files || []);
  if (files.length === 0) {
    elements.attachmentSummary.textContent =
      "No files selected · 25 MB total limit.";
    return;
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const totalMb = totalBytes / (1024 * 1024);
  const size =
    totalMb < 0.1
      ? `${Math.round(totalBytes / 1024)} KB`
      : `${totalMb.toFixed(1)} MB`;
  elements.attachmentSummary.textContent = `${files.length} ${files.length === 1 ? "file" : "files"} selected · ${size} total`;
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

function mailSenderLabel(email) {
  const address = String(email || "").trim();
  return address ? `${MAIL_DISPLAY_NAME} <${address}>` : MAIL_DISPLAY_NAME;
}

function showLoginMode() {
  elements.loginForm.hidden = false;
  elements.mfaForm.hidden = true;
  setStatus(elements.mfaStatus, "");
}

function setAuthLoading(isLoading) {
  elements.authLoading.hidden = !isLoading;
}

function showLoggedOutScreen() {
  setAuthLoading(false);
  elements.authScreen.hidden = false;
  elements.appScreen.hidden = true;
}

function showAuthenticatedScreen() {
  setAuthLoading(false);
  elements.authScreen.hidden = true;
  elements.appScreen.hidden = false;
}

function activityStorageKey(userId = currentUser?.id) {
  return userId ? `${ACTIVITY_STORAGE_PREFIX}${userId}` : "";
}

function readActivityAt(userId) {
  const key = activityStorageKey(userId);
  if (!key) return 0;

  try {
    return getSessionActivityAt({
      storedActivityAt: window.localStorage.getItem(key),
    });
  } catch {
    return 0;
  }
}

function writeActivityAt(userId, activityAt, force = false) {
  const key = activityStorageKey(userId);
  if (!key || !activityAt) return;
  if (
    !force &&
    activityAt - lastPersistedActivityAt < ACTIVITY_PERSIST_INTERVAL_MS
  ) {
    return;
  }

  try {
    window.localStorage.setItem(key, String(activityAt));
    lastPersistedActivityAt = activityAt;
  } catch {
    // The in-memory timer still protects an open tab when storage is unavailable.
  }
}

function removeActivityAt(userId) {
  const key = activityStorageKey(userId);
  if (!key) return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures while signing out.
  }
}

function clearIdleTimer() {
  window.clearTimeout(idleTimer);
  idleTimer = null;
}

function scheduleIdleLogout() {
  clearIdleTimer();
  if (!currentUser || idleLogoutInProgress) return;

  const delay = getIdleTimeoutDelay(lastActivityAt);
  if (delay <= 0) {
    void expireIdleSession();
    return;
  }

  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    void expireIdleSession();
  }, delay);
}

function startIdleTracking(nextSession) {
  const userId = nextSession?.user?.id;
  if (!userId) return;

  const storedActivityAt = readActivityAt(userId);
  const sessionActivityAt = getSessionActivityAt({
    sessionCreatedAt: nextSession.created_at,
    lastSignInAt: nextSession.user.last_sign_in_at,
  });
  lastActivityAt = storedActivityAt || sessionActivityAt;
  lastPersistedActivityAt = storedActivityAt;

  if (!storedActivityAt && sessionActivityAt) {
    writeActivityAt(userId, sessionActivityAt, true);
  }
}

function touchActivity(userId = currentUser?.id, force = false) {
  if (!userId || idleLogoutInProgress) return;

  lastActivityAt = Date.now();
  writeActivityAt(userId, lastActivityAt, force);
  scheduleIdleLogout();
}

async function expireIdleSession() {
  if (!supabase || !currentUser || idleLogoutInProgress) return;
  if (!isSessionIdle(lastActivityAt)) {
    scheduleIdleLogout();
    return;
  }

  idleLogoutInProgress = true;
  clearIdleTimer();
  const userId = currentUser.id;
  removeActivityAt(userId);
  setStatus(
    elements.loginStatus,
    `You were signed out after ${SESSION_IDLE_TIMEOUT_MS / 60000} minutes of inactivity.`,
  );

  let signOutError = null;
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    signOutError = error;
  } catch (error) {
    signOutError = error;
  }

  if (!signOutError) {
    await applySession(null);
    return;
  }

  idleLogoutInProgress = false;
  lastActivityAt = Date.now() - SESSION_IDLE_TIMEOUT_MS + 1000;
  lastPersistedActivityAt = 0;
  writeActivityAt(userId, lastActivityAt, true);
  setStatus(
    elements.loginStatus,
    signOutError.message || "Could not sign out after inactivity",
  );
  scheduleIdleLogout();
}

function stopIdleTracking() {
  clearIdleTimer();
  removeActivityAt(currentUser?.id);
  lastActivityAt = 0;
  lastPersistedActivityAt = 0;
  idleLogoutInProgress = false;
}

function handleUserActivity() {
  if (!currentUser || idleLogoutInProgress || document.hidden) return;
  touchActivity(currentUser.id);
}

function handleStoredActivity(event) {
  if (!currentUser || event.key !== activityStorageKey()) return;

  const activityAt = getSessionActivityAt({ storedActivityAt: event.newValue });
  if (!activityAt || activityAt <= lastActivityAt) return;

  lastActivityAt = activityAt;
  lastPersistedActivityAt = activityAt;
  scheduleIdleLogout();
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
  const nextUser = session?.user ?? null;

  if (!nextUser) {
    stopIdleTracking();
    currentUser = null;
    showLoggedOutScreen();
    showLoginMode();
    activeThreadId = null;
    activeThread = null;
    activeMessages = [];
    elements.activeDelete.disabled = true;
    updateMobileThreadState();
    return;
  }

  const sameUser = currentUser?.id === nextUser.id && lastActivityAt > 0;
  currentUser = nextUser;
  if (!sameUser) startIdleTracking(nextSession);

  if (isSessionIdle(lastActivityAt)) {
    showLoggedOutScreen();
    await expireIdleSession();
    return;
  }
  scheduleIdleLogout();

  const mfaReady = await requireMfaIfNeeded();
  if (!mfaReady) {
    showLoggedOutScreen();
    return;
  }

  showAuthenticatedScreen();
  elements.currentUser.textContent =
    currentUser.email || "Signed-in team member";
  elements.userAvatar.textContent = initials(currentUser.email);
  elements.composeFrom.textContent = mailSenderLabel(currentUser.email);
  await loadThreads();
}

async function loadThreads() {
  if (!supabase || !currentUser) return;

  elements.refreshButton.disabled = true;
  try {
    threads = await fetchActiveThreads(supabase);
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
  elements.threadCount.textContent = `${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}`;
  elements.threadFilterCount.textContent = String(filtered.length);
  elements.navInboxCount.textContent = String(threads.length);
  elements.threadEmptyTitle.textContent = search
    ? "No conversations found"
    : threads.length === 0
      ? "Your inbox is clear"
      : "No conversations found";
  elements.threadEmptyCopy.textContent = search
    ? "Try another search or refresh the inbox."
    : threads.length === 0
      ? "New messages will appear here when they arrive."
      : "Try another search or refresh the inbox.";

  for (const thread of filtered) {
    const item = document.createElement("div");
    item.className = "thread-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `thread-row${thread.id === activeThreadId ? " active" : ""}`;
    button.setAttribute(
      "aria-label",
      `${thread.subject || "No subject"}, ${formatDate(thread.last_message_at)}`,
    );
    button.addEventListener("click", () => void openThread(thread.id));

    const avatar = document.createElement("span");
    avatar.className = "thread-avatar";
    avatar.textContent = initials(thread.subject);

    const copy = document.createElement("span");
    copy.className = "thread-row-copy";

    const top = document.createElement("span");
    top.className = "thread-row-top";

    const subject = document.createElement("span");
    subject.className = "thread-row-title";
    subject.textContent = thread.subject || "(no subject)";

    const date = document.createElement("span");
    date.className = "thread-row-date";
    date.textContent = formatListDate(thread.last_message_at);

    const preview = document.createElement("span");
    preview.className = "thread-row-preview";
    preview.textContent = "Conversation thread";

    top.append(subject, date);
    copy.append(top, preview);
    button.append(avatar, copy);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "thread-delete";
    deleteButton.title = "Delete conversation";
    deleteButton.setAttribute(
      "aria-label",
      `Delete ${thread.subject || "conversation"}`,
    );
    deleteButton.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12m-9 0v10h6V6M8 6V4h4v2m-5 3v5m3-5v5" /></svg>';
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      requestDeleteThread(thread.id);
    });

    item.append(button, deleteButton);
    elements.threadList.append(item);
  }
}

function closeDeleteDialog() {
  if (typeof elements.deleteDialog.close === "function") {
    elements.deleteDialog.close();
  } else {
    elements.deleteDialog.removeAttribute("open");
  }
  pendingDeleteThreadId = null;
}

function requestDeleteThread(threadId) {
  if (!threads.some((thread) => thread.id === threadId)) return;
  pendingDeleteThreadId = threadId;

  if (typeof elements.deleteDialog.showModal === "function") {
    elements.deleteDialog.showModal();
  } else {
    elements.deleteDialog.setAttribute("open", "");
  }
  elements.confirmDelete.focus();
}

async function restoreThread(thread, originalIndex) {
  try {
    await updateThreadDeletedAt(supabase, thread.id, null);
  } catch (error) {
    showToast(error.message || "Could not restore this conversation");
    return;
  }

  if (!threads.some((item) => item.id === thread.id)) {
    threads.splice(Math.min(originalIndex, threads.length), 0, thread);
  }
  renderThreads();
  showToast("Conversation restored to your inbox.");
}

async function deleteThread(threadId) {
  const originalIndex = threads.findIndex((thread) => thread.id === threadId);
  if (originalIndex < 0) return;

  const thread = threads[originalIndex];
  try {
    await updateThreadDeletedAt(supabase, threadId, new Date().toISOString());
  } catch (error) {
    showToast(error.message || "Could not delete this conversation");
    return;
  }

  threads.splice(originalIndex, 1);

  if (activeThreadId === threadId) {
    clearActiveThread();
  } else {
    renderThreads();
  }

  showToast("Conversation deleted from your inbox.", {
    label: "Undo",
    onClick: () => void restoreThread(thread, originalIndex),
  });
}

async function handleDeleteSubmit(event) {
  event.preventDefault();
  const threadId = pendingDeleteThreadId;
  closeDeleteDialog();
  if (threadId) await deleteThread(threadId);
}

function clearActiveThread() {
  activeThreadId = null;
  activeThread = null;
  activeMessages = [];
  elements.activeDelete.disabled = true;
  elements.messagePlaceholder.hidden = false;
  elements.messageContent.hidden = true;
  elements.messageList.replaceChildren();
  updateMobileThreadState();
  renderThreads();
}

async function openThread(threadId) {
  if (!supabase || !currentUser) return;
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;

  activeThreadId = threadId;
  activeThread = thread;
  elements.activeDelete.disabled = false;
  updateMobileThreadState();
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

    const senderLine = document.createElement("div");
    senderLine.className = "message-sender-line";

    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.textContent = initials(
      message.direction === "inbound"
        ? message.from_address
        : MAIL_DISPLAY_NAME,
    );

    const address = document.createElement("div");
    address.className = "message-address";
    const sender = document.createElement("strong");
    sender.textContent =
      message.direction === "inbound"
        ? message.from_address
        : mailSenderLabel(message.from_address);
    const recipient = document.createElement("span");
    recipient.textContent = `To: ${asList(message.to_addresses).join(", ")}`;
    const direction = document.createElement("span");
    direction.className = "message-direction";
    direction.textContent =
      message.direction === "inbound" ? "INBOUND" : "SENT";
    sender.append(direction);
    address.append(sender, recipient);
    senderLine.append(avatar, address);

    const date = document.createElement("time");
    date.className = "message-date";
    date.dateTime = message.created_at || "";
    date.textContent = formatDate(message.created_at);
    meta.append(senderLine, date);

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
      status.className = "message-status";
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
        const icon = document.createElement("span");
        icon.className = "attachment-icon";
        icon.textContent = "↧";
        const label = document.createElement("span");
        label.className = "attachment-label";
        label.textContent = attachment.filename;
        link.append(icon, label);
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
    reply.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 6 4 10l4 4M5 10h6a5 5 0 0 1 5 5" /></svg><span>Reply</span>';
    reply.addEventListener("click", () => openCompose(message));
    actions.append(reply);
    card.append(actions);

    elements.messageList.append(card);
  }
}

async function openAttachment(link, storagePath, filename) {
  if (!supabase) return;
  const label = link.querySelector(".attachment-label");
  if (label) label.textContent = "Opening...";
  link.setAttribute("aria-busy", "true");
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 600);
  if (error || !data?.signedUrl) {
    if (label) label.textContent = "Attachment unavailable";
    link.removeAttribute("aria-busy");
    showToast(error?.message || "Could not open attachment");
    return;
  }
  if (label) label.textContent = filename;
  link.removeAttribute("aria-busy");
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
  updateAttachmentSummary();
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
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || ""),
  });
  if (error) {
    setStatus(elements.loginStatus, error.message || "Could not sign in");
    return;
  }
  touchActivity(data.session?.user?.id, true);
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
  touchActivity(data.session?.user?.id, true);
  await applySession(data.session);
}

async function init() {
  if (!supabase) {
    showLoggedOutScreen();
    setStatus(elements.loginStatus, "Mail portal configuration is missing.");
    return;
  }

  window.addEventListener("pointerdown", handleUserActivity, {
    passive: true,
  });
  window.addEventListener("keydown", handleUserActivity);
  window.addEventListener("scroll", handleUserActivity, { passive: true });
  window.addEventListener("storage", handleStoredActivity);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleIdleLogout();
  });

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
  elements.activeDelete.addEventListener("click", () => {
    if (activeThreadId) requestDeleteThread(activeThreadId);
  });
  elements.deleteForm.addEventListener("submit", (event) => {
    void handleDeleteSubmit(event);
  });
  elements.cancelDelete.addEventListener("click", closeDeleteDialog);
  elements.deleteDialog.addEventListener("close", () => {
    pendingDeleteThreadId = null;
  });
  elements.composeAttachments.addEventListener(
    "change",
    updateAttachmentSummary,
  );
  elements.composeForm.addEventListener(
    "submit",
    (event) => void sendCompose(event),
  );
  elements.threadSearch.addEventListener("input", renderThreads);
  elements.refreshButton.addEventListener("click", () => void loadThreads());
  elements.mobileThreadBack.addEventListener("click", clearActiveThread);
  elements.activeReply.addEventListener("click", () => {
    const lastInbound = [...activeMessages]
      .reverse()
      .find((message) => message.direction === "inbound");
    openCompose(lastInbound || activeMessages.at(-1) || null);
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showLoggedOutScreen();
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
