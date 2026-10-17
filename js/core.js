/* ============================================================
   CHANGELOG SYSTEM — shared core (storage, webhook, utils)
   ============================================================ */

const CL = (() => {
  const LOGS_KEY = "cl.logs.v1";
  const WEBHOOK_KEY = "cl.webhook.v1";

  /* ---------------- storage ---------------- */
  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast("Storage full — remove some logs or use smaller images.", "err");
      return false;
    }
  };

  const getLogs = () => load(LOGS_KEY, []);
  const setLogs = (logs) => save(LOGS_KEY, logs);

  const getWebhook = () => localStorage.getItem(WEBHOOK_KEY) || "";
  const setWebhook = (url) => {
    if (url) localStorage.setItem(WEBHOOK_KEY, url);
    else localStorage.removeItem(WEBHOOK_KEY);
  };

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const nowISO = () => new Date().toISOString();

  /* ---------------- log CRUD ---------------- */
  function upsertLog(entry) {
    const logs = getLogs();
    const i = logs.findIndex((l) => l.id === entry.id);
    if (i >= 0) logs[i] = { ...logs[i], ...entry };
    else logs.unshift(entry);
    setLogs(logs);
    return entry;
  }

  function getLog(id) {
    return getLogs().find((l) => l.id === id) || null;
  }

  function deleteLog(id) {
    setLogs(getLogs().filter((l) => l.id !== id));
  }

  function touchLog(id, patch) {
    const logs = getLogs();
    const i = logs.findIndex((l) => l.id === id);
    if (i < 0) return null;
    logs[i] = { ...logs[i], ...patch, updatedAt: nowISO() };
    setLogs(logs);
    return logs[i];
  }

  /* ---------------- validation ---------------- */
  function validate(data) {
    const errors = [];
    if (!data.title || !data.title.trim()) errors.push("Title is required.");
    else if (data.title.trim().length > 256)
      errors.push("Title must be 256 characters or fewer.");
    if (!data.description || !data.description.trim())
      errors.push("Description is required.");
    else if (data.description.length > 4096)
      errors.push("Description must be 4096 characters or fewer.");
    if (data.imageUrl && data.imageUrl.length > 8 * 1024 * 1024)
      errors.push("Image is too large after encoding.");
    return errors;
  }

  /* ---------------- discord webhook ---------------- */
  const EMBED_COLOR = 3447003; // #3482F6 blue

  function buildEmbed(data) {
    const embed = {
      author: { name: "Release Notes" },
      title: data.title.trim(),
      description: data.description.trim(),
      color: EMBED_COLOR,
      timestamp: data.date || nowISO(),
      footer: { text: "Changelog System" },
    };
    if (data.imageUrl && data.imageType === "remote") {
      embed.image = { url: data.imageUrl };
    }
    return embed;
  }

  /* ---------------- discord markdown (preview renderer) ---------------- */
  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /**
   * Renders a subset of Discord's markdown into HTML so the preview
   * matches how the embed will actually look once it lands in a channel.
   */
  function renderMarkdown(src) {
    if (!src) return "";
    const codeBlocks = [];
    const inlineCodes = [];

    let s = String(src)
      .replace(/\r\n?/g, "\n")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // fenced code blocks
    s = s.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (m, code) => {
      codeBlocks.push(code.replace(/\n$/, ""));
      return `\u0000CB${codeBlocks.length - 1}\u0000`;
    });

    // inline code
    s = s.replace(/`([^`\n]+)`/g, (m, code) => {
      inlineCodes.push(code);
      return `\u0000IC${inlineCodes.length - 1}\u0000`;
    });

    // line-based rules: headings, lists, quotes, hr
    const lines = s.split("\n");
    let out = [];
    let listType = null;

    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };

    for (const raw of lines) {
      let line = raw;
      let m;

      // a fenced block placeholder sitting on its own line
      if (/^\u0000CB\d+\u0000$/.test(line)) {
        closeList();
        out.push(line);
        continue;
      }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        closeList();
        out.push("<hr>");
        continue;
      }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        closeList();
        const lvl = Math.min(m[1].length, 4);
        out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
        continue;
      }
      if ((m = line.match(/^\s*(?:&gt;|>)\s?(.*)$/))) {
        closeList();
        out.push(`<blockquote>${inline(m[1])}</blockquote>`);
        continue;
      }
      if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push(`<li>${inline(m[1])}</li>`);
        continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push(`<li>${inline(m[1])}</li>`);
        continue;
      }

      closeList();
      if (line.trim() === "") out.push('<span class="md-gap"></span>');
      else out.push(`<p>${inline(line)}</p>`);
    }
    closeList();

    let html = out.join("");

    // restore code blocks / inline code
    html = html.replace(/\u0000CB(\d+)\u0000/g, (m, i) => {
      return `<pre><code>${escapeAttr(codeBlocks[+i])}</code></pre>`;
    });
    html = html.replace(/\u0000IC(\d+)\u0000/g, (m, i) => `<code>${escapeAttr(inlineCodes[+i])}</code>`);

    return html;

    function inline(t) {
      // links [text](url) — Discord requires the protocol to autolink too
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
        return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${label}</a>`;
      });
      // bare urls
      t = t.replace(/(?<!["'>])(https?:\/\/[^\s<]+)/g, (m, url) => {
        return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${url}</a>`;
      });
      // bold / underline / italic / strike
      t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
      t = t.replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/__([^_]+)__/g, "<u>$1</u>");
      t = t.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
      t = t.replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, "<em>$1</em>");
      t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
      // ||spoiler||
      t = t.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>');
      return t;
    }
  }

  /**
   * Sends the changelog to a Discord webhook.
   * Returns { ok, status, message }.
   */
  async function sendToDiscord(webhookUrl, data) {
    if (!webhookUrl) return { ok: false, message: "No webhook URL set." };

    const embed = buildEmbed(data);
    const payload = {
      username: data.botName || "Changelog",
      embeds: [embed],
      allowed_mentions: { parse: [] },
    };

    try {
      let res;

      if (data.imageBlob) {
        // upload image as an attachment and point the embed at it
        const fd = new FormData();
        const ext =
          data.imageBlob.type === "image/png"
            ? "png"
            : data.imageBlob.type === "image/gif"
            ? "gif"
            : "jpg";
        const fname = `changelog-${Date.now()}.${ext}`;
        embed.image = { url: `attachment://${fname}` };
        payload.embeds = [embed];
        fd.append("payload_json", JSON.stringify(payload));
        fd.append("files[0]", data.imageBlob, fname);

        res = await fetch(webhookUrl, { method: "POST", body: fd });
      } else {
        res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.status === 204 || res.ok) {
        return { ok: true, status: res.status, message: "Sent to Discord." };
      }
      const txt = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message: `Discord rejected the request (${res.status}) ${txt}`.trim(),
      };
    } catch (err) {
      return {
        ok: false,
        message:
          "Network error — check the webhook URL and your connection. (" +
          (err && err.message ? err.message : "unknown") +
          ")",
      };
    }
  }

  /* ---------------- images ---------------- */
  const MAX_DIM = 1400;

  function readAndCompressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/"))
        return reject(new Error("File must be an image."));
      if (file.size > 8 * 1024 * 1024)
        return reject(new Error("Image must be under 8 MB."));

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not load image."));
        img.onload = () => {
          let { width: w, height: h } = img;
          const scale = Math.min(1, MAX_DIM / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);

          const keepPng = file.type === "image/png" && file.size < 700 * 1024;
          const type = keepPng ? "image/png" : "image/jpeg";
          const quality = keepPng ? undefined : 0.86;
          const dataUrl = canvas.toDataURL(type, quality);
          const blob = dataURLtoBlob(dataUrl, type);

          resolve({
            dataUrl,
            blob,
            name: file.name,
            type,
            width: w,
            height: h,
            bytes: blob.size,
          });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function dataURLtoBlob(dataUrl, type) {
    const [head, b64] = dataUrl.split(",");
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || (head.match(/:(.*?);/) || [])[1] });
  }

  /* ---------------- formatting ---------------- */
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------- toasts ---------------- */
  function toast(message, type = "info", ms = 4200) {
    let host = document.getElementById("toasts");
    if (!host) {
      host = document.createElement("div");
      host.id = "toasts";
      document.body.appendChild(host);
    }
    const icons = { ok: "✓", err: "!", warn: "⚠", info: "i" };
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="tico">${icons[type] || "i"}</span><span></span>`;
    el.lastChild.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  return {
    getLogs, setLogs, getWebhook, setWebhook,
    upsertLog, getLog, deleteLog, touchLog,
    uid, nowISO, validate, sendToDiscord,
    readAndCompressImage, buildEmbed, dataURLtoBlob, renderMarkdown,
    fmtDate, fmtBytes, escapeHtml, toast,
  };
})();
