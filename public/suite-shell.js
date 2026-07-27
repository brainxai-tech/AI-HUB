(function () {
  const script = document.currentScript;
  const projectName = script?.dataset?.suiteProject || document.title || "AI Project";
  const hubHref = script?.dataset?.suiteHub || "/hub/";
  const projectId = script?.dataset?.suiteId || inferProjectId(projectName, window.location.pathname);
  const recentProjectsStorageKey = "aiHub.recentProjects.v1";

  recordRecentVisit();

  document.documentElement.classList.add("suite-enhanced-root");
  document.documentElement.dataset.suiteId = projectId;

  const ensureShell = () => {
    document.body.classList.add("suite-enhanced");
    document.body.dataset.suiteId = projectId;
    const firstMain = document.querySelector("main, [role='main']");
    if (firstMain && !firstMain.id) {
      firstMain.id = "suite-main";
    }
    if (firstMain && !firstMain.hasAttribute("tabindex")) {
      firstMain.setAttribute("tabindex", "-1");
    }

    const existingSkip = document.querySelector(".suite-skip-link");
    if (existingSkip && firstMain) {
      existingSkip.href = `#${firstMain.id}`;
    }
    if (document.querySelector(".suite-topbar")) return;

    let skip = null;
    if (firstMain) {
      skip = document.createElement("a");
      skip.className = "suite-skip-link";
      skip.href = `#${firstMain.id}`;
      skip.textContent = "跳到主要内容";
      skip.addEventListener("click", () => {
        window.requestAnimationFrame(() => firstMain.focus({ preventScroll: true }));
      });
    }

    const bar = document.createElement("nav");
    bar.className = "suite-topbar";
    bar.setAttribute("aria-label", "AI 项目统一导航");

    const brandWrap = document.createElement("div");
    brandWrap.className = "suite-brand-wrap";

    const brand = document.createElement("a");
    brand.className = "suite-brand";
    brand.href = hubHref;
    brand.innerHTML = '<span class="suite-mark" aria-hidden="true">AI</span><span>项目汇集库</span>';

    const project = document.createElement("div");
    project.className = "suite-project";
    project.innerHTML = `<span>当前项目</span><strong>${escapeHtml(projectName)}</strong>`;

    const actions = document.createElement("div");
    actions.className = "suite-actions";
    actions.innerHTML = `
      <a class="suite-action-link" href="${escapeAttribute(hubHref)}">项目入口</a>
    `;

    brandWrap.append(brand, project);
    bar.append(brandWrap, actions);
    document.body.prepend(bar);
    if (skip) document.body.prepend(skip);
  };

  const start = () => {
    ensureShell();
    window.addEventListener("load", ensureShell, { once: true });
    const observer = new MutationObserver(() => ensureShell());
    observer.observe(document.body, { childList: true });
    window.setTimeout(() => observer.disconnect(), 6000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return map[char];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function recordRecentVisit() {
    const path = window.location.pathname || "/";
    if (path === "/hub" || path.startsWith("/hub/")) {
      return;
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(recentProjectsStorageKey) || "[]");
      const entries = Array.isArray(parsed) ? parsed : [];
      const existing = entries.find((entry) => entry.projectId === projectId || entry.path === path);
      const now = Date.now();
      const recentlyRecorded = existing && now - Number(existing.lastOpenedAt || 0) < 10000;
      const nextEntry = {
        projectId,
        path,
        name: String(projectName).replace(/^AI\s*·\s*/u, ""),
        lastOpenedAt: now,
        visitCount: Math.max(1, Number(existing?.visitCount || 0) + (recentlyRecorded ? 0 : 1)),
      };
      const nextEntries = [
        nextEntry,
        ...entries.filter(
          (entry) => entry !== existing && entry.projectId !== projectId && entry.path !== path,
        ),
      ].slice(0, 12);
      window.localStorage.setItem(recentProjectsStorageKey, JSON.stringify(nextEntries));
    } catch {
      // Private browsing or storage policies may disable this optional history.
    }
  }

  function inferProjectId(name, pathname) {
    const value = `${name} ${pathname}`.toLowerCase();
    const matches = [
      ["qisheng", ["栖声", "qisheng"]],
      ["tarot", ["塔罗", "tarot"]],
      ["grassland", ["草原", "grassland"]],
      ["glory", ["glory", "荣耀"]],
      ["cooking", ["备餐", "cooking"]],
      ["resume", ["简历", "resume"]],
      ["elder", ["长辈", "防诈", "elder"]],
      ["hub", ["汇集库", "hub"]],
      ["idol", ["爱豆", "idol"]],
    ];
    const found = matches.find(([, needles]) => needles.some((needle) => value.includes(needle.toLowerCase())));
    return found ? found[0] : "project";
  }
})();
