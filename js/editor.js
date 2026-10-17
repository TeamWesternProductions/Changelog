/* ============================================================
   CHANGELOG SYSTEM — editor page
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    id: null,          // set when editing an existing log
    image: null,       // { dataUrl, blob, name, type, bytes }
    status: "draft",
    createdAt: null,
  };

  /* ---------------- elements ---------------- */
  const els = {
    webhook: $("webhookUrl"), hookDot: $("hookDot"),
    title: $("title"), desc: $("description"), descCount: $("descCount"),
    drop: $("drop"), file: $("fileInput"),
    thumbWrap: $("thumbWrap"), thumbImg: $("thumbImg"),
    thumbName: $("thumbName"), thumbSize: $("thumbSize"),
    btnSend: $("btnSend"), btnSaveDraft: $("btnSaveDraft"),
    btnClear: $("btnClear"), btnSaveHook: $("btnSaveHook"),
    btnCancelEdit: $("btnCancelEdit"), formHeading: $("formHeading"),
    pvTitle: $("pvTitle"), pvDesc: $("pvDesc"),
    pvImgWrap: $("pvImgWrap"), pvImg: $("pvImg"),
    pvFoot: $("pvFoot"), pvDate: $("pvDate"), pvTime: $("pvTime"),
    previewStatus: $("previewStatus"), navCount: $("navCount"),
    modal: $("confirmModal"), cmTitle: $("cmTitle"),
    cmText: $("cmText"), cmYes: $("cmYes"), cmNo: $("cmNo"),
  };

  /* ---------------- helpers ---------------- */
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

  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spin"></span> ${label}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  function updateNavCount() {
    els.navCount.textContent = CL.getLogs().length;
  }

  function refreshHookDot() {
    els.hookDot.classList.toggle("on", !!els.webhook.value.trim());
  }

  /* ---------------- preview ---------------- */
  function renderPreview() {
    const title = els.title.value.trim();
    const desc = els.desc.value;

    els.pvTitle.textContent = title || "Your changelog title";
    els.pvTitle.classList.toggle("placeholder", !title);

    if (desc.trim()) {
      els.pvDesc.innerHTML = CL.renderMarkdown(desc);
      els.pvDesc.classList.remove("placeholder");
      els.pvDesc.classList.toggle("max-h", desc.length > 700);
    } else {
      els.pvDesc.textContent = "Your description will appear here…";
      els.pvDesc.classList.add("placeholder");
      els.pvDesc.classList.remove("max-h");
    }

    els.pvFoot.textContent = "Changelog System";

    const now = new Date();
    els.pvDate.textContent = CL.fmtDate(now.toISOString());
    els.pvTime.textContent =
      "today at " +
      now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    if (state.image) {
      els.pvImg.src = state.image.dataUrl;
      els.pvImgWrap.style.display = "";
    } else {
      els.pvImg.removeAttribute("src");
      els.pvImgWrap.style.display = "none";
    }

    els.descCount.textContent = desc.length;
  }

  /* ---------------- image ---------------- */
  async function handleFile(file) {
    if (!file) return;
    try {
      const img = await CL.readAndCompressImage(file);
      state.image = img;
      els.thumbImg.src = img.dataUrl;
      els.thumbName.textContent = img.name;
      els.thumbSize.textContent =
        `${img.width}×${img.height} • ${CL.fmtBytes(img.bytes)} (compressed)`;
      els.thumbWrap.style.display = "flex";
      els.drop.style.display = "none";
      renderPreview();
      CL.toast("Image ready.", "ok", 2200);
    } catch (e) {
      CL.toast(e.message || "Could not load image.", "err");
    }
  }

  function clearImage() {
    state.image = null;
    els.file.value = "";
    els.thumbWrap.style.display = "none";
    els.drop.style.display = "";
    renderPreview();
  }

  /* ---------------- form io ---------------- */
  function collect() {
    return {
      title: els.title.value,
      description: els.desc.value,
      imageUrl: state.image ? state.image.dataUrl : "",
      imageType: "remote",
      imageBlob: state.image ? state.image.blob : null,
      imageMeta: state.image
        ? { name: state.image.name, w: state.image.width, h: state.image.height, bytes: state.image.bytes }
        : null,
    };
  }

  function resetForm(keepWebhook = true) {
    state.id = null;
    state.image = null;
    state.status = "draft";
    state.createdAt = null;
    els.title.value = "";
    els.desc.value = "";
    els.file.value = "";
    els.thumbWrap.style.display = "none";
    els.drop.style.display = "";
    els.formHeading.textContent = "New Changelog";
    els.btnCancelEdit.style.display = "none";
    els.previewStatus.textContent = "DRAFT";
    els.previewStatus.className = "status draft";
    setEditButtonMode(false);
    renderPreview();
    updateNavCount();
    if (!keepWebhook) els.webhook.value = "";
    refreshHookDot();
    history.replaceState(null, "", "index.html");
  }

  function setEditButtonMode(on) {
    els.btnSend.innerHTML = on ? "🚀 Send Update" : "🚀 Send to Discord";
    els.btnSaveDraft.innerHTML = on ? "💾 Save Changes" : "💾 Save to Logs";
    els.btnClear.textContent = on ? "Back to Logs" : "Clear";
  }

  function loadForEdit(id) {
    const log = CL.getLog(id);
    if (!log) {
      CL.toast("That changelog no longer exists.", "err");
      resetForm();
      return;
    }
    state.id = log.id;
    state.status = log.status || "draft";
    state.createdAt = log.createdAt || log.date;
    els.title.value = log.title || "";
    els.desc.value = log.description || "";

    if (log.imageUrl && log.imageMeta) {
      state.image = {
        dataUrl: log.imageUrl,
        blob: null, // rebuilt from dataUrl at send time
        name: log.imageMeta.name || "image.png",
        type: (log.imageUrl.match(/^data:(.*?);/) || [])[1] || "image/png",
        width: log.imageMeta.w,
        height: log.imageMeta.h,
        bytes: log.imageMeta.bytes,
      };
      els.thumbImg.src = log.imageUrl;
      els.thumbName.textContent = state.image.name;
      els.thumbSize.textContent = `${state.image.width}×${state.image.height} • ${CL.fmtBytes(state.image.bytes)}`;
      els.thumbWrap.style.display = "flex";
      els.drop.style.display = "none";
    } else {
      clearImage();
    }

    els.formHeading.textContent = "Editing Changelog";
    els.btnCancelEdit.style.display = "";
    els.previewStatus.textContent = state.status === "sent" ? "EDITING SENT LOG" : "EDITING DRAFT";
    els.previewStatus.className = "status " + (state.status === "sent" ? "sent" : "draft");
    setEditButtonMode(true);
    renderPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "index.html?edit=" + encodeURIComponent(id));
    CL.toast("Loaded changelog for editing.", "info", 2600);
  }

  function snapshot() {
    const data = collect();
    return {
      id: state.id || CL.uid(),
      title: data.title.trim(),
      description: data.description,
      imageUrl: data.imageUrl,
      imageMeta: data.imageMeta,
      status: state.status,
      date: state.createdAt || CL.nowISO(),
      updatedAt: CL.nowISO(),
    };
  }

  /* ---------------- send / save ---------------- */
  async function doSend() {
    const data = collect();
    const errors = CL.validate(data);
    if (errors.length) {
      CL.toast(errors[0], "err");
      return;
    }

    const hook = els.webhook.value.trim();
    if (!hook) {
      CL.toast("Add your Discord webhook URL first.", "warn");
      els.webhook.focus();
      return;
    }
    if (!/^https?:\/\/(discord\.com|discordapp\.com)\//i.test(hook)) {
      const go = await confirmDialog(
        "Unusual webhook URL",
        "This doesn't look like a Discord webhook URL. Send anyway?"
      );
      if (!go) return;
    }

    setBusy(els.btnSend, true, "Sending…");

    // image stored as dataUrl needs a blob for multipart upload
    if (state.image && !state.image.blob) {
      state.image.blob = CL.dataURLtoBlob
        ? CL.dataURLtoBlob(state.image.dataUrl, state.image.type)
        : null;
      if (!state.image.blob) {
        const r = await fetch(state.image.dataUrl);
        state.image.blob = await r.blob();
      }
    }

    const res = await CL.sendToDiscord(hook, data);
    setBusy(els.btnSend, false);

    if (!res.ok) {
      CL.toast(res.message, "err", 6500);
      return;
    }

    state.status = "sent";
    const entry = snapshot();
    entry.status = "sent";
    entry.sentAt = CL.nowISO();
    CL.upsertLog(entry);
    state.id = entry.id;

    els.previewStatus.textContent = "SENT ✓";
    els.previewStatus.className = "status sent";
    setEditButtonMode(true);
    els.formHeading.textContent = "Editing Changelog";
    els.btnCancelEdit.style.display = "";
    updateNavCount();

    CL.toast("Changelog sent to Discord and saved to logs.", "ok");
    history.replaceState(null, "", "index.html?edit=" + encodeURIComponent(entry.id));
  }

  async function doSaveDraft() {
    const data = collect();
    const errors = CL.validate(data);
    if (errors.length) {
      CL.toast(errors[0], "err");
      return;
    }
    const entry = snapshot();
    CL.upsertLog(entry);
    state.id = entry.id;
    state.status = entry.status;
    updateNavCount();
    setEditButtonMode(true);
    els.formHeading.textContent = "Editing Changelog";
    els.btnCancelEdit.style.display = "";
    CL.toast("Saved to logs.", "ok");
    history.replaceState(null, "", "index.html?edit=" + encodeURIComponent(entry.id));
  }

  async function doClear() {
    if (state.id) {
      window.location.href = "logs.html";
      return;
    }
    const dirty = els.title.value.trim() || els.desc.value.trim() || state.image;
    if (dirty) {
      const go = await confirmDialog("Clear form", "Discard everything you typed?");
      if (!go) return;
    }
    resetForm();
  }

  /* ---------------- events ---------------- */
  els.title.addEventListener("input", renderPreview);
  els.desc.addEventListener("input", renderPreview);

  els.drop.addEventListener("click", () => els.file.click());
  els.file.addEventListener("change", () => handleFile(els.file.files[0]));

  ["dragenter", "dragover"].forEach((ev) =>
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.remove("drag");
    })
  );
  els.drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  $("btnRemoveImg").addEventListener("click", clearImage);

  els.btnSaveHook.addEventListener("click", () => {
    const url = els.webhook.value.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      CL.toast("Webhook URL must start with http(s)://", "err");
      return;
    }
    CL.setWebhook(url);
    refreshHookDot();
    CL.toast(url ? "Webhook saved." : "Webhook cleared.", "ok", 2400);
  });

  els.webhook.addEventListener("input", refreshHookDot);

  els.btnSend.addEventListener("click", doSend);
  els.btnSaveDraft.addEventListener("click", doSaveDraft);
  els.btnClear.addEventListener("click", doClear);
  els.btnCancelEdit.addEventListener("click", () => resetForm());

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      doSend();
    }
  });

  /* ---------------- boot ---------------- */
  els.webhook.value = CL.getWebhook();
  refreshHookDot();
  updateNavCount();
  renderPreview();

  const params = new URLSearchParams(location.search);
  const editId = params.get("edit");
  if (editId) loadForEdit(editId);
})();
