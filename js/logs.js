/* ============================================================
   CHANGELOG SYSTEM — logs page (restore / edit / resend)
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    logs: $("logs"), empty: $("empty"), navCount: $("navCount"),
    search: $("search"), sort: $("sort"),
    btnClearAll: $("btnClearAll"),
    modal: $("confirmModal"), cmTitle: $("cmTitle"),
    cmText: $("cmText"), cmYes: $("cmYes"), cmNo: $("cmNo"),
  };

  function confirmDialog(title, text) {
    return new Promise((resolve) => {
      els.cmTitle.textContent = title;
      els.cmText.textContent = text;
      els.modal.classList.add("show");
      const done = (v) => {
        els.modal.classList.remove("show");
        els.cmYes.onclick = els.cmNo.onclick = null;
        resolve(v);
      };
      els.cmYes.onclick = () => done(true);
      els.cmNo.onclick = () => done(false);
    });
  }

  function filtered() {
    const q = els.search.value.trim().toLowerCase();
    let logs = CL.getLogs().filter((l) => {
      return (
        !q ||
        (l.title || "").toLowerCase().includes(q) ||
        (l.description || "").toLowerCase().includes(q)
      );
    });

    if (els.sort.value === "new")
      logs.sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));
    else if (els.sort.value === "old")
      logs.sort((a, b) => new Date(a.date) - new Date(b.date));
    else logs.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    return logs;
  }

  function render() {
    const logs = filtered();
    const total = CL.getLogs().length;
    els.navCount.textContent = total;
    els.empty.style.display = total ? "none" : "";
    els.logs.innerHTML = "";

    if (!total) return;

    if (!logs.length) {
      els.logs.innerHTML =
        `<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div>
         <h3>No matches</h3><p>Try another search term.</p></div>`;
      return;
    }

    logs.forEach((l, i) => {
      const card = document.createElement("article");
      card.className = "log-card";
      card.style.animationDelay = Math.min(i * 0.05, 0.4) + "s";

      const excerpt = (l.description || "").slice(0, 240);
      const cover = l.imageUrl
        ? `<img src="${l.imageUrl}" alt="" loading="lazy" />`
        : `<div class="no-img">🖼️</div>`;

      card.innerHTML = `
        <div class="log-cover">
          ${cover}
        </div>
        <div class="log-body">
          <h3>${CL.escapeHtml(l.title || "Untitled")}</h3>
          <div class="excerpt">${CL.escapeHtml(excerpt)}</div>
          <div class="log-meta">
            <span class="status ${l.status === "sent" ? "sent" : "draft"}">${l.status === "sent" ? "Sent" : "Draft"}</span>
            <span>📅 ${CL.fmtDate(l.date)}</span>
            ${l.sentAt ? `<span>🚀 ${CL.fmtDate(l.sentAt)}</span>` : ""}
          </div>
        </div>
        <div class="log-actions">
          <button class="btn btn-ghost btn-sm" data-act="edit">✏️ Edit</button>
          <button class="btn btn-primary btn-sm" data-act="send">🚀 Send</button>
          <button class="btn btn-danger btn-sm" data-act="del">🗑</button>
        </div>`;

      card.querySelector('[data-act="edit"]').addEventListener("click", () => {
        window.location.href = "index.html?edit=" + encodeURIComponent(l.id);
      });

      card.querySelector('[data-act="send"]').addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const hook = CL.getWebhook();
        if (!hook) {
          CL.toast("No webhook saved. Opening the editor to add one.", "warn");
          window.location.href = "index.html?edit=" + encodeURIComponent(l.id);
          return;
        }
        btn.disabled = true;
        const old = btn.innerHTML;
        btn.innerHTML = `<span class="spin"></span> Sending…`;

        let blob = null;
        if (l.imageUrl && l.imageUrl.startsWith("data:")) {
          const type = (l.imageUrl.match(/^data:(.*?);/) || [])[1];
          blob = CL.dataURLtoBlob(l.imageUrl, type);
        }

        const res = await CL.sendToDiscord(hook, {
          title: l.title,
          description: l.description,
          imageUrl: blob ? "" : l.imageUrl,
          imageBlob: blob,
          date: l.date,
        });

        btn.disabled = false;
        btn.innerHTML = old;

        if (res.ok) {
          CL.touchLog(l.id, { status: "sent", sentAt: CL.nowISO() });
          CL.toast(`"${l.title}" sent to Discord.`, "ok");
          render();
        } else {
          CL.toast(res.message, "err", 6500);
        }
      });

      card.querySelector('[data-act="del"]').addEventListener("click", async () => {
        const go = await confirmDialog(
          "Delete changelog",
          `Delete "${l.title}" permanently? This cannot be undone.`
        );
        if (!go) return;
        CL.deleteLog(l.id);
        CL.toast("Changelog deleted.", "info", 2400);
        render();
      });

      els.logs.appendChild(card);
    });
  }

  /* events */
  els.search.addEventListener("input", render);
  els.sort.addEventListener("change", render);

  els.btnClearAll.addEventListener("click", async () => {
    if (!CL.getLogs().length) return;
    const go = await confirmDialog(
      "Clear all logs",
      `Delete all ${CL.getLogs().length} saved changelogs permanently?`
    );
    if (!go) return;
    CL.setLogs([]);
    CL.toast("All logs cleared.", "info");
    render();
  });

  render();
})();
