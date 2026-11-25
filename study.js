(() => {
"use strict";
const $ = id => document.getElementById(id);
const config = window.STUDY_CONFIG;
const params = new URLSearchParams(location.search);
const uuid = () => crypto.randomUUID();
const run = { id: uuid(), code: "", condition: "", events: [] };
const assignedCode = params.get("participant");
const validCode = /^[A-Za-z0-9_-]{1,32}$/;
run.code = validCode.test(assignedCode || "") ? assignedCode : "H-" + run.id.slice(0, 8).toUpperCase();
$("participant").textContent = run.code;
$("privacy").textContent = config.formsEndpoint
  ? "Your participant code, ratings, and task events will be saved to Google Forms."
  : "Preview mode. Download your session at the end to save a copy.";
const stress = ["stress", "How stressed do you feel right now?", 0, 10, "No stress", "Extreme stress"];
const followup = [
  stress,
  ["understood", "Reachy understood what I needed.", 1, 7],
  ["comfortable", "I felt comfortable interacting with Reachy.", 1, 7],
  ["coordinated", "Reachy and I worked well together.", 1, 7],
  ["connected", "I felt a connection with Reachy.", 1, 7],
  ["reuse", "I would use Reachy for another puzzle.", 1, 7],
  ["warmth", "Reachy came across as warm and friendly.", 1, 7],
  ["competence", "Reachy came across as capable and knowledgeable.", 1, 7]
];
function makeRatings(id, items) {
  for (const [key, title, min, max, low = "Strongly disagree", high = "Strongly agree"] of items) {
    const field = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = title;
    const choices = document.createElement("div");
    choices.className = "ratings";
    choices.style.setProperty("--count", max - min + 1);
    for (let value = min; value <= max; value++) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      Object.assign(radio, { type: "radio", name: key, value, required: true });
      radio.setAttribute("aria-label", String(value));
      const chip = document.createElement("span");
      chip.textContent = value;
      const position = (value - min) / (max - min);
      const favorable = key === "stress" ? 1 - position : position;
      chip.style.setProperty("--tone", "hsl(" + (5 + 140 * favorable) + " 68% 85%)");
      label.append(radio, chip);
      choices.append(label);
    }
    const anchors = document.createElement("div");
    anchors.className = "anchors";
    for (const text of [low, high]) {
      const anchor = document.createElement("span");
      anchor.textContent = text;
      anchors.append(anchor);
    }
    field.append(legend, choices, anchors);
    $(id).append(field);
  }
}
makeRatings("preRatings", [stress]);
makeRatings("midRatings", [stress]);
makeRatings("postRatings", followup);
function screen(id) {
  const screens = ["before", "puzzle", "between", "after"];
  const current = id === "puzzle" ? (assisted ? 2 : 1) : id === "between" ? 1 : id === "after" ? 3 : 0;
  screens.forEach((name, i) => {
    $(name).hidden = id !== name;
    const step = $("progress").children[i];
    if (i === current) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  const title = $(id).querySelector("h1");
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}
screen("before");

const pegCount = config.pegs;
let assisted = false, diskCount = config.soloDisks;
let board = Array(diskCount).fill(0), selected = null, drag = null;
let phase = "orientation", started, deadline, t, count = 0, replyId = 0;
let advice, lastMove, lastOffer = 0, offerReason, struggle = 0;
let clipTimer;
const colors = ["#ffc487", "#ef927d", "#7dd4c4", "#a9a4e8", "#e6d486"];
const time = () => started === undefined ? null : Math.round(performance.now() - started);
function log(type, details = {}) { run.events.push({ type, ms: time(), ...details }); }
const topDisk = (state, peg) => state.indexOf(peg);
function neighbors(state) {
  const moves = [];
  for (let from = 0; from < pegCount; from++) {
    const disk = topDisk(state, from);
    if (disk < 0) continue;
    for (let to = 0; to < pegCount; to++) {
      const dest = topDisk(state, to);
      if (to !== from && (dest < 0 || dest > disk)) {
        const next = [...state];
        next[disk] = to;
        moves.push({ from, to, disk, next });
      }
    }
  }
  return moves;
}
function solve(state) {
  const queue = [{ state, first: null }], seen = new Set([state.join("")]);
  for (const node of queue) {
    if (node.state.every(peg => peg === pegCount - 1)) return node.first;
    for (const move of neighbors(node.state)) {
      const key = move.next.join("");
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: move.next, first: node.first || move });
    }
  }
  return null;
}
function draw() {
  $("board").replaceChildren();
  for (let peg = 0; peg < pegCount; peg++) {
    const button = document.createElement("button");
    button.className = "peg";
    button.disabled = phase !== "running";
    button.dataset.peg = peg;
    button.setAttribute("aria-pressed", String(selected === peg));
    const rod = document.createElement("span");
    rod.className = "rod";
    const stack = document.createElement("span");
    stack.className = "stack";
    board.forEach((position, disk) => {
      if (position !== peg) return;
      const piece = document.createElement("span");
      piece.className = "disk";
      piece.dataset.disk = disk;
      piece.style.width = 43 + disk * 12 + "%";
      piece.style.background = colors[disk];
      piece.setAttribute("aria-hidden", "true");
      stack.append(piece);
    });
    const label = document.createElement("span");
    label.textContent = "Peg " + (peg + 1) + (peg === pegCount - 1 ? " · Goal" : "");
    button.setAttribute("aria-label", label.textContent + ", " + stack.childElementCount + (stack.childElementCount === 1 ? " disk" : " disks"));
    button.append(rod, stack, label);
    $("board").append(button);
  }
}
function move(from, to, input) {
  if (phase !== "running") return;
  if (Date.now() >= deadline) return end("time_limit");
  const moving = neighbors(board).find(move => move.from === from && move.to === to);
  selected = null;
  if (!moving) {
    $("moveNote").textContent = "Choose an empty peg or one with a larger disk on top.";
    log("illegal_move", { from: from + 1, to: to + 1, input });
    if (assisted && ++struggle >= 2) offerHelp("illegal_moves");
    if (assisted) clip("retry");
  } else {
    board = moving.next;
    if (phase === "running") {
      count++;
      lastMove = Date.now();
      struggle = 0;
      log("move", { from: from + 1, to: to + 1, disk: moving.disk + 1, input, board: board.map(peg => peg + 1) });
      if (advice) {
        log("hint_outcome", { request: advice.request, followed: advice.from === from && advice.to === to });
        advice = null;
      }
    }
    $("moveNote").textContent = "Choose your next disk.";
  }
  draw();
  $("moves").textContent = count + (count === 1 ? " move" : " moves");
  if (input === "keyboard") $("board").children[to]?.focus();
  if (phase === "running" && board.every(peg => peg === pegCount - 1)) end("solved");
}
let suppressClickUntil = 0;
$("board").onclick = event => {
  if (phase !== "running" || performance.now() < suppressClickUntil) return;
  const pegButton = event.target.closest(".peg");
  if (!pegButton) return;
  const peg = Number(pegButton.dataset.peg);
  if (selected !== null && selected !== peg) return move(selected, peg, event.detail === 0 ? "keyboard" : "tap");
  selected = selected === peg || topDisk(board, peg) < 0 ? null : peg;
  $("moveNote").textContent = selected === null ? "Choose a peg with a disk." : "Now choose a destination.";
  draw();
  if (event.detail === 0) $("board").children[peg].focus();
};
$("board").onpointerdown = event => {
  if (!event.isPrimary || event.button !== 0 || phase !== "running") return;
  const disk = event.target.closest(".disk");
  if (!disk) return;
  const from = Number(disk.closest(".peg").dataset.peg);
  if (+disk.dataset.disk !== topDisk(board, from)) return;
  drag = { id: event.pointerId, from, disk, x: event.clientX, y: event.clientY };
};
$("board").onpointermove = event => {
  if (drag?.id !== event.pointerId) return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
  if (!drag.ghost) {
    drag.ghost = drag.disk.cloneNode();
    drag.ghost.classList.add("ghost");
    drag.ghost.style.width = drag.disk.getBoundingClientRect().width + "px";
    document.body.append(drag.ghost);
    $("board").setPointerCapture(event.pointerId);
  }
  drag.ghost.style.left = event.clientX + "px";
  drag.ghost.style.top = event.clientY + "px";
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".peg");
  for (const peg of $("board").children) peg.classList.toggle("drop", peg === target);
};
function release(event) {
  if (drag?.id !== event.pointerId) return;
  const active = drag;
  drag = null;
  if (!active.ghost) return;
  active.ghost.remove();
  for (const peg of $("board").children) peg.classList.remove("drop");
  suppressClickUntil = performance.now() + 350;
  if (event.type !== "pointerup") return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".peg");
  if (target && +target.dataset.peg !== active.from) move(active.from, +target.dataset.peg, event.pointerType + "_drag");
}
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
function clip(name, hold = false) {
  clearTimeout(clipTimer);
  const robot = $("robot");
  robot.src = "media/" + name + ".webm";
  robot.play().catch(() => {});
  if (name !== "idle" && !hold) clipTimer = setTimeout(() => clip("idle"), 2900);
}
function offerHelp(reason) {
  if (!assisted || phase !== "running" || $("hint").disabled || !$("offer").hidden || Date.now() - lastOffer < 25000) return;
  lastOffer = Date.now();
  offerReason = reason;
  log("help_offered", { reason });
  $("offer").hidden = false;
  $("reply").textContent = run.condition === "friendly" ? "Want to try a hint together?" : "A next-move hint is available.";
  clip("thinking");
}
function tick() {
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  $("timer").textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  $("timer").classList.toggle("urgent", seconds <= 60);
  if (!seconds) end("time_limit");
  else if (Date.now() - lastMove >= 25000) offerHelp("inactivity");
}
$("start").onclick = () => {
  board = Array(diskCount).fill(0);
  selected = null;
  phase = "running";
  started = performance.now();
  lastMove = Date.now();
  deadline = lastMove + config.roundSeconds * 1000;
  draw();
  $("start").hidden = true;
  $("stop").hidden = false;
  $("hint").disabled = $("question").disabled = $("send").disabled = !assisted;
  $("moveNote").textContent = "Select or drag the top disk.";
  log("task_started");
  t = setInterval(tick, 250);
  tick();
};
function prepareRound(withReachy) {
  assisted = withReachy;
  diskCount = assisted ? config.assistedDisks : config.soloDisks;
  phase = "orientation";
  board = Array(diskCount).fill(0);
  started = undefined;
  selected = advice = null;
  count = struggle = lastOffer = 0;
  $("coachPanel").hidden = !assisted;
  $("puzzle").classList.toggle("solo", !assisted);
  $("board").style.setProperty("--pegs", pegCount);
  $("taskTitle").textContent = "Move the tower to Peg " + pegCount;
  $("moveNote").textContent = assisted ? "Round 2 · " + diskCount + " rings. Start the timer to ask Reachy for help." : "Round 1 · " + diskCount + " rings. Start the timer to move them on your own.";
  $("timer").textContent = Math.floor(config.roundSeconds / 60) + ":" + String(config.roundSeconds % 60).padStart(2, "0");
  $("timer").classList.remove("urgent");
  $("moves").textContent = "0 moves";
  $("start").hidden = false;
  $("stop").hidden = true;
  screen("puzzle");
  if (assisted) clip("idle");
  draw();
}
function end(outcome) {
  if (phase !== "running") return;
  phase = "done";
  clearInterval(t);
  silence();
  log("task_ended", { outcome });
  const round = assisted ? "assisted" : "solo";
  const record = { outcome, durationMs: time(), pegs: pegCount, disks: diskCount, events: run.events };
  run[round] = record;
  run.events = [];
  queueRecord(round, record);
  const result = {
    solved: "You solved the puzzle in " + count + " moves.",
    time_limit: "The time is up.",
    stopped: "You ended the round."
  }[outcome];
  if (!assisted) {
    $("soloOutcome").textContent = result;
    screen("between");
    return;
  }
  $("outcome").textContent = result;
  screen("after");
  const closing = $("closing");
  closing.src = outcome === "solved" ? "media/success.webm" : "media/finish.webm";
  closing.play().catch(() => {});
}
$("stop").onclick = () => end("stopped");
function silence() {
  replyId++;
  window.speechSynthesis?.cancel();
}
function speakingClip(id) {
  if (id === replyId && phase === "running") clip(run.condition === "friendly" ? "hint" : "thinking", true);
}
function finishSpeech(id) {
  if (id === replyId && phase === "running") clip("idle");
}
function deviceSpeech(text, id) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = .92;
  utterance.onstart = () => speakingClip(id);
  utterance.onend = utterance.onerror = () => finishSpeech(id);
  window.speechSynthesis.speak(utterance);
}
$("sound").onchange = () => {
  if (!$("sound").checked) {
    silence();
    clip("idle");
  }
};
function help(question, input) {
  if (!assisted || phase !== "running") return;
  if (Date.now() >= deadline) return end("time_limit");
  const hint = solve(board);
  if (!hint) return;
  silence();
  const id = replyId;
  const then = performance.now();
  $("offer").hidden = true;
  log(input === "offer" ? "offer_accepted" : "help_requested", { input, request: id });
  if (advice) log("hint_superseded", { request: advice.request });
  advice = { ...hint, request: id };
  const instruction = "Pick up the " + ["orange", "coral", "teal", "purple", "yellow"][hint.disk]
    + " disk from peg " + (hint.from + 1) + ". Place it on peg " + (hint.to + 1) + ".";
  const friendly = run.condition === "friendly";
  const simple = (friendly ? "Let’s take it one move at a time. " : "") + instruction;
  $("reply").textContent = simple;
  clip(friendly ? "hint" : "thinking");
  log("hint_shown", { request: id, from: hint.from + 1, to: hint.to + 1, latencyMs: Math.round(performance.now() - then) });
  const spoken = question ? explainRule(question) + " " + simple : simple;
  $("reply").textContent = spoken;
  if ($("sound").checked) deviceSpeech(spoken, id);
}
function explainRule(question) {
  if (/larger|smaller|size|big/i.test(question)) return "Larger disks must stay below smaller disks.";
  if (/goal|finish|win/i.test(question)) return "Stack every disk on peg " + pegCount + " to finish.";
  return "Only the top disk of each peg can move.";
}
$("hint").onclick = () => help("", "button");
$("ask").onsubmit = event => {
  event.preventDefault();
  const question = $("question").value.trim();
  if (!question) return;
  $("question").value = "";
  help(question, "typed");
};
$("accept").onclick = () => help("", "offer");
$("dismiss").onclick = () => {
  $("offer").hidden = true;
  log("offer_dismissed", { reason: offerReason });
  $("reply").textContent = "You can ask for a hint at any time.";
};

function submitToForms(record) {
  if (!config.formsEndpoint) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    const nonce = uuid();
    const form = document.createElement("form");
    const frame = document.createElement("iframe");
    frame.name = "study_" + nonce;
    frame.hidden = form.hidden = true;
    Object.assign(form, { action: config.formsEndpoint, target: frame.name, method: "POST" });
    for (const [name, value] of Object.entries({ payload: JSON.stringify(record), nonce, origin: location.origin })) {
      const input = document.createElement("input");
      Object.assign(input, { name, value, type: "hidden" });
      form.append(input);
    }
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receipt);
      frame.remove();
      form.remove();
    };
    function receipt(event) {
      const hostname = new URL(event.origin === "null" ? "https://invalid.local" : event.origin).hostname;
      if (!(hostname === "script.google.com" || hostname.endsWith(".googleusercontent.com")) || event.data?.nonce !== nonce) return;
      cleanup();
      if (event.data.ok) resolve(true);
      else reject(new Error("Google Forms could not save the response."));
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Google Forms did not confirm the response."));
    }, 18000);
    window.addEventListener("message", receipt);
    document.body.append(frame, form);
    form.submit();
  });
}
const readRatings = form => Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, Number(value)]));
const uploads = new Map();
function sendRecord(record) {
  return submitToForms(record).catch(() => false);
}
function queueRecord(stage, fields) {
  const record = { id: run.id, code: run.code, condition: run.condition, stage, ...fields };
  uploads.set(stage, { record, pending: sendRecord(record) });
}
$("baseline").onsubmit = event => {
  event.preventDefault();
  run.pre = readRatings(event.currentTarget);
  run.condition = config.condition === "random"
    ? (crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "friendly" : "direct")
    : config.condition;
  queueRecord("before", { ratings: run.pre });
  prepareRound(false);
};
$("checkpoint").onsubmit = event => {
  event.preventDefault();
  run.mid = readRatings(event.currentTarget);
  queueRecord("between", { ratings: run.mid });
  prepareRound(true);
};
$("followup").onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  run.post = readRatings(event.currentTarget);
  const record = { id: run.id, code: run.code, condition: run.condition, stage: "after", ratings: run.post };
  $("download").hidden = false;
  if (!config.formsEndpoint) {
    $("saveStatus").textContent = "Preview complete. Download the session record below.";
    return;
  }
  $("saveStatus").textContent = "Saving your questionnaires and task record…";
  try {
    for (const upload of uploads.values()) {
      if (!(await upload.pending)) upload.pending = sendRecord(upload.record);
      if (!(await upload.pending)) throw new Error("Google Forms did not confirm the " + upload.record.stage + " record.");
    }
    await submitToForms(record);
    $("saveStatus").textContent = "Session saved to Google Forms. Thank you.";
  } catch (error) {
    $("saveStatus").textContent = error.message + " Retry or download the record.";
    button.textContent = "Retry save";
    button.disabled = false;
  }
};
$("download").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hanoi-" + run.code + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

})();
