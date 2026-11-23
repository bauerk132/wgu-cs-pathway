import { CATALOG, LINKS } from "./catalog.js";
import { BY_CODE, COURSE_STATUS, STATUS_LABEL, ORIENTATION, MENTOR, normalize, record, totals, sumCU, sortedCourses, openCourses, nextCourse, moveCourse, termDates, dateLabel, paceGroups } from "./state.js";

const PAGES = [
  ["dashboard", "Overview", "dashboard"], ["courses", "Courses", "book"], ["sequence", "Study order", "sequence"],
  ["pace", "Plan comparison", "chart"], ["enrollment", "Enrollment", "calendar"], ["connections", "Connections", "link"]
];
const icons = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 1 0 0 4h13M8 7h7m-7 4h6"/>',
  sequence: '<path d="M9 6h11M9 12h8m-8 6h11M4 6h.01M4 12h.01M4 18h.01"/>',
  chart: '<path d="M4 4v16h16M8 15l4-5 3 2 5-6"/><path d="M16 6h4v4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 15h4"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2m3 5a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2"/>',
  credits: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M5 21V4m0 1c4-4 9 4 14 0v10c-5 4-10-4-14 0"/>',
  external: '<path d="M13 5h6v6m0-6-8 8m7 0v6H5V6h6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  plus: '<path d="M6 12h12m-6-6v12"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>'
};
const main = document.querySelector("#main");
const dialog = document.querySelector("#editor");
const sync = document.querySelector("#sync");
const retry = document.querySelector("#retry");
const backup = document.querySelector("#backup-file");
const nav = document.querySelector("#nav");
const breadcrumb = document.querySelector("#breadcrumb");
const toast = document.querySelector("#toast");

let state, revision, pending, saving = false, conflicted = false, toastTimeout;
let filter = {term:"all", status:"all", query:""};

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
})[char]);
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const link = (href, label, classes = "button") => `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer" class="${classes}">${escape(label)} ${icon("external")}</a>`;
const route = (target, label, classes = "button") => `<a href="#${target}" class="${classes}">${label}</a>`;
const button = (action, label, classes = "button", attrs = "") => `<button type="button" class="${classes}" data-action="${action}" ${attrs}>${label}</button>`;
const badge = (status, color = "neutral") => `<span class="badge ${color}">${escape(status)}</span>`;
const courseBadge = status => badge(STATUS_LABEL[status], status);
const courseButton = (code, label, classes = "button") => button("course", label, classes, `data-id="${code}"`);
const percent = (val, max) => max ? Math.round(val / max * 100) : 0;
const bar = (value, max, label) => `<progress value="${value}" max="${max}" aria-label="${escape(label)}"></progress>`;
const options = (values, selected) => values.map(value => {
  const [key, label] = Array.isArray(value) ? value : [value, value];
  return `<option value="${escape(key)}"${String(key) === String(selected) ? " selected" : ""}>${escape(label)}</option>`;
}).join("");
const rowTitle = ([code, name]) => `<span class="code">${code}</span><strong>${escape(name)}</strong>`;
const headline = (title, desc, action = "") => `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
const termLabel = (term) => {
  const [start, end] = termDates(state.enrollment.startDate, term);
  return `${dateLabel(start)} – ${dateLabel(end)}`;
};
function page() {
  const value = location.hash.slice(1).split("/")[0];
  return PAGES.some(([key]) => key === value) ? value : "dashboard";
}
function paintNav() {
  nav.innerHTML = PAGES.map(([key, label, image]) => `<a href="#${key}" ${key === page() ? 'aria-current="page"' : ""}>${icon(image)}<span>${label}</span></a>`).join("");
  breadcrumb.textContent = PAGES.find(([key]) => key === page())[1];
}
function metric(image, label, value, hint) {
  return `<section class="metric"><div class="metric-head">${icon(image)} ${label}</div><div class="metric-value">${value}</div><p>${hint}</p></section>`;
}
function dashboard() {
  const t = totals(state);
  const current = BY_CODE.get(state.currentCourse);
  const entry = current && record(state, current[0]);
  const next = nextCourse(state);
  const upcoming = state.tasks.filter(task => !task.done).sort((a,b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const work = current && !entry.blockers.trim() ? current : next;
  const nextEntry = work && record(state, work[0]);
  const pendingCourseAction = openCourses(state).filter(([code]) => {
    const rec = record(state, code);
    return code !== work?.[0] && rec.nextAction.trim() && !rec.blockers.trim();
  }).sort((a, b) => (record(state, a[0]).due || "9999").localeCompare(record(state, b[0]).due || "9999"))[0];
  const ratio = percent(t.cu, t.max);
  return `<section class="hero">
    <div class="hero-copy"><p class="eyebrow">WESTERN GOVERNORS UNIVERSITY</p><h1>B.S. Computer<br class="hero-break"> Science</h1><div class="hero-meta">${icon("calendar")} <span>${escape(state.enrollment.startStatus)} · <strong>${dateLabel(state.enrollment.startDate)}</strong></span></div></div>
    <div class="hero-progress" role="img" aria-label="${ratio} percent of competency units completed">
      <div class="ring" style="--progress:${ratio}%"><div><strong>${ratio}%</strong><span>DEGREE PROGRESS</span></div></div>
    </div></section>
    <div class="metric-grid">
      ${metric("credits", "Competency units", `${t.cu}<small> / 121</small>`, `${121 - t.cu} CUs remaining`)}
      ${metric("check", "Courses completed", `${t.courses}<small> / 39</small>`, `${39 - t.courses} courses remaining`)}
      ${metric("calendar", "Official terms", "10", "Six months per term")}
      ${metric("flag", "Open follow-ups", String(upcoming.length), upcoming.length ? "Enrollment and planning" : "All caught up")}
    </div>
    <div class="dashboard-columns">
    <section class="card"><div class="card-header"><h2>${icon("focus")} Current course</h2>${current ? courseBadge(entry.status) : badge("Unassigned")}</div>
      ${current ? `<p class="eyebrow">${current[0]} · ${current[2]} CU · OFFICIAL TERM ${current[3]}</p><h3>${escape(current[1])}</h3>
      <p>${entry.blockers.trim() ? "<strong>Blocker</strong> · " + escape(entry.blockers) : escape(entry.nextAction || "Add a next action to plan your next study session.")}</p>
      ${courseButton(current[0], "Open course", "button primary")}` :
      `<h3>Choose a course to focus on</h3><p>Set your current course once you know what you’ll start with.</p>${button("choose-course", "Set current course", "button primary")}`}
    </section>
    <section class="card"><div class="card-header"><h2>${icon("sequence")} Work on next</h2>${route("enrollment", "Follow-ups", "text-link")}</div>
      ${upcoming[0] && !current ? queueTask(upcoming[0]) : ""}
      ${work ? `<div class="queue-row"><div><span class="code">${work[0]} · ${work[0] === state.currentCourse ? "Current course" : "Suggested course"}</span><strong>${escape(nextEntry.nextAction.trim() || work[1])}</strong>${nextEntry.due ? `<small>${dateLabel(nextEntry.due)}</small>` : ""}</div>${courseButton(work[0], "Open", "quiet")}</div>` : `<p>${t.courses === 39 ? "All courses are complete." : "Review blockers on the remaining courses."}</p>`}
      ${pendingCourseAction ? `<div class="queue-row"><div><span class="code">${pendingCourseAction[0]} · Course action</span><strong>${escape(record(state, pendingCourseAction[0]).nextAction)}</strong></div>${courseButton(pendingCourseAction[0], "Open", "quiet")}</div>` : ""}
      ${upcoming[0] && current ? queueTask(upcoming[0]) : ""}
    </section></div>
    <section class="section"><div class="section-heading"><div><h2>Term progress</h2><p>All ten terms from your personalized degree plan</p></div>${route("courses", "View all courses")}</div>
    <div class="term-grid">${Array.from({length:10}, (_, index) => termCard(index+1)).join("")}</div></section>`;
}
function queueTask(task) {
  return `<div class="queue-row"><div><span class="code">FOLLOW-UP${task.due ? " · " + dateLabel(task.due) : ""}</span><strong>${escape(task.title)}</strong></div>${button("task", "Open", "quiet", `data-id="${task.id}"`)}</div>`;
}
function termCard(term) {
  const courses = CATALOG.filter(item => item[3] === term);
  const t = totals(state, courses);
  return `<a class="term-card" href="#courses/${term}"><div><strong>Term ${String(term).padStart(2,"0")}</strong><span>${t.cu} / ${t.max} CU</span></div>
    ${bar(t.cu, t.max, "Term " + term + " competency units")}<small>${t.courses} of ${courses.length} complete</small></a>`;
}
function courseMatches(course) {
  const [code, name, , term] = course;
  return (filter.term === "all" || Number(filter.term) === term) &&
    (filter.status === "all" || record(state, code).status === filter.status) &&
    (code + " " + name).toLowerCase().includes(filter.query.toLowerCase().trim());
}
function courseGroups() {
  const courses = CATALOG.filter(courseMatches);
  if (!courses.length) return '<div class="card empty">No courses match these filters.</div>';
  return Array.from({length:10}, (_, i) => i+1).map(term => {
    const shown = courses.filter(course => course[3] === term);
    if (!shown.length) return "";
    const t = totals(state, CATALOG.filter(course => course[3] === term));
    return `<section class="course-group"><div class="course-heading"><div><h2>Term ${term}</h2><p>${termLabel(term)} · projected dates</p></div><span>${t.cu} / ${t.max} CU complete</span></div>
      ${shown.map(course => {
        const [code, , cu] = course;
        const entry = record(state, code);
        return `<div class="course-row"><div>${courseButton(code, rowTitle(course), "course-title")}${entry.blockers ? badge("Blocked", "caution") : ""}${state.currentCourse === code ? badge("Current", "in-progress") : ""}</div><span>${cu} CU</span>${courseBadge(entry.status)}${courseButton(code, "Edit", "quiet")}</div>`;
      }).join("")}</section>`;
  }).join("");
}
function coursesPage() {
  const selected = location.hash.split("/")[1];
  if (selected && /^[1-9]$|^10$/.test(selected)) filter.term = selected;
  return headline("Courses", "The 39 courses in your November 4, 2026 personalized degree plan.", link(LINKS.official, "WGU degree plan")) +
    `<div class="filters"><label class="search-field">${icon("search")}<input type="search" id="course-search" placeholder="Search course name or code" aria-label="Search courses" value="${escape(filter.query)}"></label>
    <label><span class="sr">Term</span><select id="term-filter">${options([["all","All terms"], ...Array.from({length:10}, (_, i) => [i+1, "Term " + (i+1)])], filter.term)}</select></label>
    <label><span class="sr">Status</span><select id="status-filter">${options([["all","All statuses"], ...COURSE_STATUS.map(s => [s, STATUS_LABEL[s]])], filter.status)}</select></label></div>
    <div id="course-results">${courseGroups()}</div>`;
}
function sequence() {
  return headline("Study order", "Move courses as your mentor and myWGU confirm the sequence. Official term groupings appear alongside your order.", button("reset-order", "Restore official order")) +
    `<div class="list-card">${sortedCourses(state).map((course, index) => {
      const [code, name, cu, term] = course;
      return `<div class="sequence-row"><span class="order-index">${index + 1}</span>
      <div>${courseButton(code, rowTitle(course), "course-title")}<small>${cu} CU · Official term ${term}</small></div>
      <div class="reorder-controls">
      ${button("move", icon("up"), "quiet icon-button", `data-id="${code}" data-offset="-1" aria-label="Move ${escape(name)} up"${index === 0 ? " disabled" : ""}`)}
      ${button("move", icon("down"), "quiet icon-button", `data-id="${code}" data-offset="1" aria-label="Move ${escape(name)} down"${index === 38 ? " disabled" : ""}`)}
      ${button("position", "Move to…", "quiet", `data-id="${code}"`)}</div></div>`;
    }).join("")}</div>`;
}
function pace() {
  const count = state.accelerationTerms;
  const groups = paceGroups(state);
  const date = state.enrollment.startDate;
  const baseDate = "2026-12-01";
  return headline("Plan comparison", "Compare WGU’s standard projection with the pace you want to explore.", link(LINKS.pace, "Life HQ pace notes")) +
    `<div class="dashboard-columns pace-columns">
      <section class="card"><div class="card-header"><h2>Standard plan</h2>${badge("WGU projection")}</div>
        <div class="metric-value">10<small> terms</small></div><p>Projected graduation <strong>November 30, 2031</strong> in the November 4 letter.</p>
        <dl class="facts"><div><dt>Duration</dt><dd>60 months</dd></div><div><dt>Average pace</dt><dd>12.1 CUs per term</dd></div><div><dt>Published start</dt><dd>${dateLabel(baseDate)}</dd></div></dl>
        ${date !== baseDate ? `<p>Estimated finish at the updated start date · ${dateLabel(termDates(date,10)[1])}</p>` : ""}
      </section>
      <section class="card accent-card"><div class="card-header"><h2>Accelerated plan</h2>${badge("Planning scenario", "caution")}</div>
        <div class="metric-value">${count}<small> terms</small></div><p>Estimated finish <strong>${dateLabel(termDates(date, count)[1])}</strong> using your ${dateLabel(date)} start.</p>
        <dl class="facts"><div><dt>Duration</dt><dd>${count * 6} months</dd></div><div><dt>Average pace</dt><dd>${(121 / count).toFixed(1)} CUs per term</dd></div><div><dt>Courses per month</dt><dd>${(39 / (count * 6)).toFixed(2)}</dd></div></dl>
        <label class="field">Choose a scenario<select id="pace-terms">${options(Array.from({length:9},(_,i) => [i+2, (i+2) + " terms"]), count)}</select></label>
      </section>
    </div>
    <section class="section"><div class="section-heading"><div><h2>Accelerated term breakdown</h2><p>Courses are spread across the selected terms using your study order. Review readiness and registration with your mentor.</p></div></div>
    <div class="list-card">${groups.map((courses, index) => `<details class="pace-row"><summary><strong>Term ${index+1}</strong><span>${termLabel(index+1)}</span><span>${courses.length} courses · ${sumCU(courses)} CU</span></summary>
      <ul>${courses.map(([code,name,cu]) => `<li><span class="code">${code}</span> ${escape(name)} <small>· ${cu} CU</small></li>`).join("")}</ul></details>`).join("")}</div></section>`;
}


const input = (label, name, value, props = "") => `<label class="field">${label}<input name="${name}" value="${escape(value)}" ${props}></label>`;
const area = (label, name, value, placeholder = "", max = 6000) => `<label class="field">${label}<textarea name="${name}" rows="3" maxlength="${max}" placeholder="${escape(placeholder)}">${escape(value)}</textarea></label>`;
const select = (label, name, values, current) => `<label class="field">${label}<select name="${name}">${options(values, current)}</select></label>`;
function enrollment() {
  const info = state.enrollment;
  return headline("Enrollment", "Keep your start details, mentor questions, and funding follow-ups in one place.", link(LINKS.school, "School in Life HQ")) +
    `<form id="enrollment-form"><div class="dashboard-columns enrollment-columns">
      <section class="card"><div class="card-header"><h2>Start and orientation</h2>${link(LINKS.orientation, "Life HQ record", "text-link")}</div>
      <div class="form-grid">${input("Start date", "startDate", info.startDate, 'type="date" min="1900-01-01" max="2199-12-31" required')}${select("Start date status","startStatus",["Target date","Confirmed in myWGU","Tentative"],info.startStatus)}
      ${select("Orientation status","orientation",ORIENTATION,info.orientation)}${input("Orientation completion date", "orientationDate", info.orientationDate, 'type="date" min="1900-01-01" max="2199-12-31"')}</div>
      ${area("Confirmed orientation details", "orientationNotes", info.orientationNotes)}</section>
      <section class="card"><div class="card-header"><h2>Program mentor</h2>${badge(info.mentor ? "Name recorded" : "Name unknown", info.mentor ? "neutral" : "caution")}</div>
      <div class="form-grid">${select("Assignment status","mentorStatus",MENTOR,info.mentorStatus)}${input("Mentor name", "mentor", info.mentor, 'maxlength="180" placeholder="Enter the name from myWGU"')}</div>
      ${area("Assignment or meeting notes", "mentorNotes", info.mentorNotes)}</section>
      <section class="card"><div class="card-header"><h2>Class selection</h2></div>
      ${area("Questions for your mentor", "questions", info.questions)}</section>
      <section class="card"><div class="card-header"><h2>Financial aid and payment plan</h2></div>
      ${area("Confirmed or reported updates", "finance", info.finance)}
      ${area("Unknowns and items to verify", "financeUnknown", info.financeUnknown)}</section>
    </div><button class="button primary" type="submit">Save enrollment details</button></form>
    <section class="section"><div class="section-heading"><div><h2>Follow-up tasks</h2><p>Track enrollment actions or hand one off to your task app.</p></div>${button("task","Add task","button primary")}</div>
    <div class="list-card">${state.tasks.length ? state.tasks.map(task => `<div class="task-row">
      <input class="task-check" type="checkbox" aria-label="Mark ${escape(task.title)} ${task.done ? "open" : "complete"}" data-task-check="${task.id}"${task.done ? " checked" : ""}>
      <div><strong class="${task.done ? "done-title" : ""}">${escape(task.title)}</strong>${task.due ? `<small>Due ${dateLabel(task.due)}</small>` : ""}</div>
      ${button("task","Edit","quiet",`data-id="${task.id}"`)}
      ${button("handoff-task","Send to app","quiet",`data-id="${task.id}"`)}</div>`).join("") : '<p class="empty">No follow-ups added yet.</p>'}</div></section>`;
}
function connections() {
  return headline("Connections", "Use this tracker for your degree and bring the next action into the apps you already use.") +
    `<div class="connection-grid">
      <section class="card connection"><div class="provider provider-notion">N</div><div><h2>Notion Life HQ</h2>${badge("Linked")}</div><p>Open your existing hub, School page, or degree plan reference.</p><div class="btn-row">${link(LINKS.notion,"Open Life HQ")}${link(LINKS.school,"School")}${link(LINKS.courseList,"Course list")}</div></section>
      <section class="card connection"><div class="provider provider-todoist">T</div><div><h2>Todoist</h2>${badge("Manual handoff")}</div><p>Copy a task with its course code and date. Open Todoist or pass the task to Claude to add.</p><div class="btn-row">${link(LINKS.todoist,"Open WGU in Todoist")}</div></section>
      <section class="card connection"><div class="provider provider-tasks">${icon("check")}</div><div><h2>Google Tasks</h2>${badge("Manual handoff")}</div><p>Copy an action and paste it into your list in Google Tasks.</p><div class="btn-row">${link(LINKS.tasks,"Open Google Tasks")}</div></section>
      <section class="card connection"><div class="provider provider-calendar">${icon("calendar")}</div><div><h2>Google Calendar</h2>${badge("Event draft")}</div><p>Use a saved action date to open a prefilled all-day event. Review it in Google Calendar before saving.</p><div class="btn-row">${link(LINKS.calendar,"Open Calendar")}${button("calendar-start","Draft term start")}</div></section>
    </div>
    <section class="section card"><div class="card-header"><h2>Backups and previous tracker</h2>${badge("Private account storage")}</div>
    <p>Export a backup any time. Import a backup from this app or your existing Firebase tracker to bring over course progress, notes, and study order.</p>
    <div class="btn-row">${button("export","Export backup")}${button("import","Import backup")}${link(LINKS.firebase,"Open Firebase tracker")}</div></section>`;
}
const renderers = {dashboard, courses:coursesPage, sequence, pace, enrollment, connections};
function render() {
  paintNav();
  if (state) main.innerHTML = renderers[page()]();
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 4200);
}
function showStatus(message, action = "") {
  sync.dataset.mode = action ? "attention" : "normal";
  sync.textContent = message;
  retry.textContent = action;
  retry.classList.toggle("hidden", !action);
}
async function load() {
  showStatus("Loading cloud copy…");
  try {
    const response = await fetch("/api/state", {cache:"no-store"});
    const data = await response.json();
    if (response.status === 401) {
      main.innerHTML = `<section class="card load-card"><h1>Sign in to CS Pathway</h1><p>Sign in to open your private tracker.</p><a class="button primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a></section>`;
      showStatus("Sign-in required");
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load cloud data.");
    state = data.state;
    revision = data.revision;
    pending = undefined;
    conflicted = false;
    showStatus(data.updatedAt ? "Saved to your account" : "Ready to save");
    render();
  } catch (error) {
    if (!state) main.innerHTML = '<section class="card load-card"><h1>Cloud copy unavailable</h1><p>Try again to load your tracker.</p></section>';
    showStatus(error.message, "Retry");
  }
}
function change(mutate) {
  if (!state) return;
  mutate(state);
  pending = structuredClone(state);
  render();
  if (!conflicted) void save();
}
async function save() {
  if (saving || !pending || conflicted) return;
  saving = true;
  showStatus("Saving…");
  const snapshot = pending;
  let continueSaving = false;
  try {
    const response = await fetch("/api/state", {
      method:"PUT", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({state:snapshot, revision})
    });
    const data = await response.json();
    if (!response.ok) {
      conflicted = response.status === 409;
      throw new Error(data.error || "Could not save.");
    }
    revision = data.revision;
    if (pending === snapshot) {
      pending = undefined;
      state = data.state;
      showStatus("Saved to your account");
    } else {
      continueSaving = true;
    }
  } catch (error) {
    showStatus(conflicted ? "Cloud version changed · draft unsaved" : "Cloud save failed · draft unsaved", conflicted ? "Resolve" : "Retry");
    showToast(error.message);
  } finally {
    saving = false;
    if (continueSaving) void save();
  }
}
function showEditor(title, subhead, content, buttons, type, id = "") {
  dialog.dataset.type = type;
  dialog.dataset.id = id;
  dialog.innerHTML = `<form id="dialog-form"><header class="dialog-head"><div><p class="eyebrow">${subhead}</p><h2 id="editor-title">${escape(title)}</h2></div>${button("close", icon("close"), "quiet icon-button", 'aria-label="Close dialog"')}</header><div class="dialog-body">${content}</div><footer class="dialog-footer">${buttons}</footer></form>`;
  if (!dialog.open) dialog.showModal();
  else dialog.querySelector("input:not([type=hidden]),select,textarea,button")?.focus();
}
const submit = label => `<button type="submit" class="button primary">${label}</button>`;
function courseEditor(code) {
  const [,name,cu,term] = BY_CODE.get(code);
  const item = record(state, code);
  const current = state.currentCourse === code;
  showEditor(name, `${code} · ${cu} CU · OFFICIAL TERM ${term}`,
    `<div class="form-grid">${select("Course status", "status", COURSE_STATUS.map(s => [s,STATUS_LABEL[s]]), item.status)}
      <label class="check-field"><input type="checkbox" name="current"${current ? " checked" : ""}> Set as my current course</label></div>
      ${input("Next action", "nextAction", item.nextAction, 'maxlength="6000" placeholder="What will you do in your next study session?"')}
      ${input("Target date", "due", item.due, 'type="date" min="1900-01-01" max="2199-12-31"')}
      ${area("Blockers", "blockers", item.blockers, "What is holding you up?")}
      ${area("Exam notes", "examNotes", item.examNotes)}
      ${area("Project notes", "projectNotes", item.projectNotes)}
      ${area("Study resources", "resources", item.resources, "Paste links or add resource names.")}`,
    `${item.nextAction.trim() ? button("handoff-course","Send saved action to app","quiet",`data-id="${code}"`) : ""}${submit("Save course")}`, "course", code);
}
function taskEditor(id) {
  const task = state.tasks.find(item => item.id === id);
  showEditor(task ? "Edit follow-up" : "Add follow-up", "ENROLLMENT",
    `${input("What needs to happen?", "title", task?.title, 'required maxlength="200"')}${input("Due date", "due", task?.due, 'type="date" min="1900-01-01" max="2199-12-31"')}${area("Notes","note", task?.note, "", 1500)}
    <label class="check-field"><input type="checkbox" name="done"${task?.done ? " checked" : ""}> Complete</label>`,
    `${task ? button("delete-task","Delete task","quiet danger",`data-id="${id}"`) : ""}${submit("Save task")}`, "task", id || "");
}
function chooseCourse() {
  const courses = openCourses(state);
  showEditor("Set current course", "COURSEWORK",
    courses.length ? select("Course", "code", courses.map(([code,name]) => [code,code + " · " + name]), state.currentCourse) : "<p>All 39 courses are complete.</p>",
    courses.length ? submit("Set current course") : button("close","Close"), "choose");
}
function positionEditor(code) {
  const position = state.order.indexOf(code) + 1;
  showEditor("Move " + BY_CODE.get(code)[1], "STUDY ORDER",
    input("Study order position (1–39)", "position", position, 'type="number" min="1" max="39" required'), submit("Move course"), "position", code);
}
function handoff(title, description, date) {
  const lines = [title, date && "Date: " + dateLabel(date), description].filter(Boolean).join("\n");
  showEditor("Send to another app", "TASK HANDOFF",
    `<p>Copy the task for your list, or open a Calendar draft. Calendar drafts include the title and date.</p>
    <label class="field">Task text<textarea id="handoff-text" rows="5" readonly>${escape(lines)}</textarea></label>
    <div class="btn-row">${button("copy","Copy task")}${link(LINKS.todoist,"Todoist")}${link(LINKS.tasks,"Google Tasks")}${date ? link(calendarLink(title,date),"Google Calendar draft") : ""}</div>
    ${date ? "" : "<p>Add a date to the saved task to draft a Calendar event.</p>"}`, button("close","Done"), "handoff");
}
function calendarLink(title, date) {
  const end = new Date(date + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate()+1);
  const dates = date.replaceAll("-","") + "/" + end.toISOString().slice(0,10).replaceAll("-","");
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({action:"TEMPLATE",text:title.slice(0,250),dates});
}
function download() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)], {type:"application/json"}));
  const a = Object.assign(document.createElement("a"), {href:url, download:"wgu-cs-pathway-backup.json"});
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
let importDraft;
backup.addEventListener("change", async () => {
  const file = backup.files[0];
  backup.value = "";
  if (!file) return;
  try {
    if (file.size > 3000000) throw new Error("This backup is too large.");
    const raw = JSON.parse(await file.text());
    const data = raw?.state ?? raw?.data ?? raw;
    if (!Array.isArray(data?.order) || !data.order.some(code => BY_CODE.has(code)) ||
        !data.courses || typeof data.courses !== "object" || Array.isArray(data.courses)) {
      throw new Error("Choose a WGU tracker JSON backup.");
    }
    importDraft = normalize({
      ...state, ...data,
      enrollment: data.enrollment ?? state.enrollment,
      tasks: data.tasks ?? state.tasks
    });
    showEditor("Import tracker backup", "BACKUP",
      "<p>This replaces the matching tracker data with the chosen file. Export your current copy first if you want to keep it.</p>",
      button("export","Export current copy","quiet") + submit("Import backup"), "import");
  } catch (error) { showToast(error.message); }
});
function formValues(form) {
  return Object.fromEntries(new FormData(form));
}
document.addEventListener("submit", event => {
  const form = event.target;
  if (!form.matches("#dialog-form, #enrollment-form")) return;
  event.preventDefault();
  const data = formValues(form);
  if (form.id === "enrollment-form") {
    change(next => {next.enrollment = data;});
    return;
  }
  const {type,id} = dialog.dataset;
  if (type === "course") {
    change(next => {
      const {current, ...course} = data;
      if (current && course.status === "not-started") course.status = "in-progress";
      next.courses[id] = course;
      if (current && course.status !== "complete") next.currentCourse = id;
      else if (next.currentCourse === id) next.currentCourse = "";
    });
  } else if (type === "choose" && BY_CODE.has(data.code)) {
    change(next => {
      const item = record(next,data.code);
      item.status = "in-progress";
      next.courses[data.code] = item;
      next.currentCourse = data.code;
    });
  } else if (type === "task") {
    const title = data.title.trim();
    if (!title) {
      showToast("Enter a task title.");
      return;
    }
    if (!id && state.tasks.length >= 100) {
      showToast("The tracker supports 100 follow-ups. Delete an old one to add another.");
      return;
    }
    change(next => {
      const item = {id:id || crypto.randomUUID(), title, note:data.note, due:data.due, done:data.done === "on"};
      if (id) next.tasks = next.tasks.map(task => task.id === id ? item : task);
      else next.tasks.push(item);
    });
  } else if (type === "position") {
    change(next => moveCourse(next,id,Number(data.position)-1));
  } else if (type === "reset-order") {
    change(next => {next.order = CATALOG.map(([code]) => code);});
  } else if (type === "delete-task") {
    change(next => {next.tasks = next.tasks.filter(task => task.id !== id);});
  } else if (type === "import" && importDraft) {
    const imported = importDraft;
    importDraft = undefined;
    change(next => Object.assign(next, imported));
  } else if (type === "conflict") {
    void load();
  }
  dialog.close();
});
document.addEventListener("click", async event => {
  const control = event.target.closest("[data-action]");
  if (!control || !state) return;
  const {action,id,offset} = control.dataset;
  if (action === "close") dialog.close();
  else if (action === "course") courseEditor(id);
  else if (action === "choose-course") chooseCourse();
  else if (action === "task") taskEditor(id);
  else if (action === "position") positionEditor(id);
  else if (action === "move") {
    change(next => moveCourse(next,id,next.order.indexOf(id)+Number(offset)));
    document.querySelector(`[data-action="move"][data-id="${id}"][data-offset="${offset}"]:enabled`)?.focus();
  } else if (action === "reset-order") {
    showEditor("Restore official course order?", "STUDY ORDER", "<p>Your custom sequence will be replaced by the order in the WGU letter.</p>", submit("Restore order"), "reset-order");
  } else if (action === "delete-task") {
    showEditor("Delete follow-up?", "ENROLLMENT", "<p>This removes the task from your tracker.</p>", submit("Delete task"), "delete-task", id);
  } else if (action === "handoff-task") {
    const task = state.tasks.find(item => item.id === id);
    handoff(task.title,task.note,task.due);
  } else if (action === "handoff-course") {
    const item = record(state,id);
    handoff(id + " · " + item.nextAction,BY_CODE.get(id)[1],item.due);
  } else if (action === "calendar-start") {
    handoff("WGU B.S. Computer Science term start (" + state.enrollment.startStatus.toLowerCase() + ")", "", state.enrollment.startDate);
  } else if (action === "copy") {
    const field = document.querySelector("#handoff-text");
    try {
      await navigator.clipboard.writeText(field.value);
      showToast("Task copied.");
    } catch {
      field.focus();
      field.select();
      showToast("Text selected. Use your device’s Copy command.");
    }
  } else if (action === "export") download();
  else if (action === "import") backup.click();
});
function updateCourseResults() {
  document.querySelector("#course-results").innerHTML = courseGroups();
}
document.addEventListener("input", event => {
  if (event.target.id === "course-search") {
    filter.query = event.target.value;
    updateCourseResults();
  }
});
document.addEventListener("change", event => {
  const target = event.target;
  if (target.id === "term-filter") {
    filter.term = target.value;
    history.replaceState(null, "", "#courses" + (filter.term === "all" ? "" : "/" + filter.term));
    updateCourseResults();
  } else if (target.id === "status-filter") {
    filter.status = target.value;
    updateCourseResults();
  } else if (target.id === "pace-terms") {
    change(next => {next.accelerationTerms = Number(target.value);});
    document.querySelector("#pace-terms")?.focus();
  } else if (target.dataset.taskCheck) {
    change(next => {next.tasks.find(item => item.id === target.dataset.taskCheck).done = target.checked;});
    document.querySelector(`[data-task-check="${target.dataset.taskCheck}"]`)?.focus();
  }
});
retry.addEventListener("click", () => {
  if (conflicted) {
    showEditor("Your cloud copy changed", "CLOUD SAVE",
      "<p>Another tab or device saved a newer version. Export this draft if you want to keep a copy, then load the newer version.</p>",
      button("export","Export draft","quiet") + submit("Load cloud copy"), "conflict");
  } else if (pending) void save();
  else void load();
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") return;
  if (page() === "courses") filter.term = location.hash.split("/")[1] ?? "all";
  render();
  main.focus();
  window.scrollTo(0,0);
});
window.addEventListener("beforeunload", event => {
  if (pending) event.preventDefault();
});
document.querySelector("#notion-link").href = LINKS.notion;
paintNav();
void load();

