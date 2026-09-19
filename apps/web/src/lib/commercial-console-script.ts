const AI_REPLIES: Record<string, string> = {
  "Why is this flagged high risk?":
    'Two independent signals triggered it: a direct sanctions-list match<span class="ai-cite">1</span> and a mixer-adjacent hop<span class="ai-cite">2</span>. Either alone would raise the score; together they push it to High.',
  "Is this safe to onboard?":
    "No — based on the current screening, this address should not be onboarded without manual compliance review. The sanctions match alone is normally a hard block under most VASP policies.",
  "What does mixer-adjacent mean?":
    "It means an address one hop away has prior transaction history with a known mixing/tumbling service, which is often used to break the traceability of funds — it doesn't confirm wrongdoing by itself, but it's a recognized risk signal.",
};

const FALLBACK_REPLY =
  "I can only speak to what the attribution engine found on this trace — for anything outside this result, check the case notes or ask a senior analyst.";

export function initCommercialConsole(root: HTMLElement): () => void {
  const listeners: Array<[EventTarget, string, EventListener]> = [];
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  function on(el: EventTarget, type: string, handler: EventListener) {
    el.addEventListener(type, handler);
    listeners.push([el, type, handler]);
  }

  function showPage(id: string) {
    root.querySelectorAll(".page").forEach((p) => p.classList.remove("on"));
    root.querySelectorAll("aside a[data-page]").forEach((a) => a.classList.remove("on"));
    root.querySelector(`#page-${id}`)?.classList.add("on");
    root.querySelector(`aside a[data-page="${id}"]`)?.classList.add("on");
    root.querySelector("main")?.scrollTo?.({ top: 0 });
  }

  root.querySelectorAll<HTMLElement>("aside a[data-page]").forEach((a) => {
    on(a, "click", () => showPage(a.dataset["page"] ?? ""));
  });
  root.querySelectorAll<HTMLElement>("[data-goto]").forEach((el) => {
    on(el, "click", (e) => {
      e.preventDefault();
      showPage(el.dataset["goto"] ?? "");
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-pathview]").forEach((btn) => {
    on(btn, "click", () => {
      root
        .querySelector("#pathPanel")
        ?.classList.toggle("list", btn.dataset["pathview"] === "list");
      btn.parentElement?.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    });
  });

  const panel = root.querySelector<HTMLDivElement>("#aiPanel");
  const aiBody = root.querySelector<HTMLDivElement>("#aiBody");
  const aiInput = root.querySelector<HTMLInputElement>("#aiInput");

  function toggleAI() {
    panel?.classList.toggle("open");
  }

  function appendAI(role: "user" | "assistant", text: string, asHtml: boolean) {
    if (!aiBody) return;
    const msg = document.createElement("div");
    msg.className = "ai-msg" + (role === "user" ? " user" : "");

    const avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.textContent = role === "user" ? "AM" : "✦";

    const bubble = document.createElement("div");
    bubble.className = "ai-bubble";
    if (asHtml) bubble.innerHTML = text;
    else bubble.textContent = text;

    msg.append(avatar, bubble);
    aiBody.appendChild(msg);
    aiBody.scrollTop = aiBody.scrollHeight;
  }

  function reply(question: string) {
    const answer = AI_REPLIES[question];
    timers.push(
      setTimeout(() => appendAI("assistant", answer ?? FALLBACK_REPLY, answer !== undefined), 500),
    );
  }

  root.querySelectorAll<HTMLElement>("[data-ai-toggle]").forEach((el) => on(el, "click", toggleAI));

  root.querySelectorAll<HTMLElement>("[data-ai-ask]").forEach((chip) => {
    on(chip, "click", () => {
      const question = chip.textContent ?? "";
      if (!panel?.classList.contains("open")) toggleAI();
      appendAI("user", question, false);
      reply(question);
    });
  });

  function send() {
    const value = aiInput?.value.trim();
    if (!aiInput || !value) return;
    appendAI("user", value, false);
    aiInput.value = "";
    reply(value);
  }

  const sendButton = root.querySelector<HTMLElement>("[data-ai-send]");
  if (sendButton) on(sendButton, "click", send);
  if (aiInput) {
    on(aiInput, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") send();
    });
  }

  return () => {
    timers.forEach(clearTimeout);
    listeners.forEach(([el, type, handler]) => el.removeEventListener(type, handler));
  };
}
