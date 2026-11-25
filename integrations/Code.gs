const FIELDS = {
  key: "Record ID", code: "Participant code", condition: "Help style", stage: "Study stage",
  stress: "Current stress", understood: "Felt understood", comfortable: "Felt comfortable",
  coordinated: "Worked well together", connected: "Felt connected", reuse: "Would use again",
  warmth: "Perceived warmth", competence: "Perceived competence",
  pegs: "Peg count", disks: "Disk count", outcome: "Puzzle outcome", durationMs: "Puzzle duration (ms)", events: "Task event timeline (JSON)"
};

// Run once in the account that should own the study responses.
function createStudyForm() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty("FORM_ID")) throw new Error("This script already has a study form.");
  const form = FormApp.create("Hanoi with Reachy — study responses");
  form.setCollectEmail(false).setDescription("Pilot study records from the Hanoi with Reachy website.");
  for (const [key, title] of Object.entries(FIELDS)) {
    if (key === "events") form.addParagraphTextItem().setTitle(title);
    else form.addTextItem().setTitle(title);
  }
  properties.setProperty("FORM_ID", form.getId());
  console.log(form.getEditUrl());
}

function doPost(e) {
  const allowed = PropertiesService.getScriptProperties().getProperty("SITE_ORIGIN");
  const { nonce, origin, payload } = e.parameter;
  if (!allowed || origin !== allowed || !/^[a-f0-9-]{36}$/.test(nonce || "")) {
    return HtmlService.createHtmlOutput("Invalid study submission.");
  }
  let ok = false;
  try {
    if (!payload || payload.length > 500000) throw new Error("Invalid response size");
    const data = JSON.parse(payload);
    recordStudyResponse(data);
    ok = true;
  } catch (error) {
    console.warn(String(error));
  }
  const message = JSON.stringify({ nonce, ok });
  return HtmlService.createHtmlOutput("<script>window.top.postMessage(" + message + "," + JSON.stringify(allowed) + ");</script>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function recordStudyResponse(data) {
  if (!/^[a-f0-9-]{36}$/.test(data.id || "") || !/^[A-Za-z0-9_-]{1,32}$/.test(data.code || "")
      || !["before", "solo", "between", "assisted", "after"].includes(data.stage) || !["friendly", "direct"].includes(data.condition)) {
    throw new Error("Invalid study record");
  }
  const isPuzzle = ["solo", "assisted"].includes(data.stage);
  const isAfter = data.stage === "after";
  const ratings = isAfter ? ["stress", "understood", "comfortable", "coordinated", "connected", "reuse", "warmth", "competence"] : isPuzzle ? [] : ["stress"];
  for (const rating of ratings) {
    const value = data.ratings?.[rating];
    if (!Number.isInteger(value) || value < (rating === "stress" ? 0 : 1) || value > (rating === "stress" ? 10 : 7)) {
      throw new Error("Missing or invalid rating");
    }
  }
  if (isPuzzle && (!["solved", "stopped", "time_limit"].includes(data.outcome)
      || !Number.isInteger(data.pegs) || !Number.isInteger(data.disks)
      || !Number.isInteger(data.durationMs) || data.durationMs < 0 || !Array.isArray(data.events))) {
    throw new Error("Invalid puzzle outcome");
  }
  const key = data.id + ":" + data.stage;
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const form = FormApp.openById(properties.getProperty("FORM_ID"));
    const items = Object.fromEntries(form.getItems().map(item => [item.getTitle(), item]));
    const keyItem = items[FIELDS.key];
    const duplicate = form.getResponses().some(response => response.getResponseForItem(keyItem)?.getResponse() === key);
    if (duplicate) return;
    const answers = { key, code: data.code, condition: data.condition, stage: data.stage };
    for (const field of ratings) answers[field] = data.ratings[field];
    if (isPuzzle) Object.assign(answers, { pegs: data.pegs, disks: data.disks, outcome: data.outcome, durationMs: data.durationMs, events: JSON.stringify(data.events) });
    const response = form.createResponse();
    for (const [field, value] of Object.entries(answers)) {
      const item = items[FIELDS[field]];
      response.withItemResponse(field === "events"
        ? item.asParagraphTextItem().createResponse(value)
        : item.asTextItem().createResponse(String(value)));
    }
    response.submit();
  } finally {
    lock.releaseLock();
  }
}
