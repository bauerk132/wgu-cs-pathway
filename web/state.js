import { CATALOG } from "./catalog.js";

export const COURSE_STATUS = ["not-started", "in-progress", "complete"];
export const STATUS_LABEL = {
  "not-started": "Not started", "in-progress": "In progress", complete: "Complete"
};
export const COURSE_FIELDS = ["examNotes", "projectNotes", "resources", "blockers", "nextAction"];
export const ORIENTATION = ["Unknown", "Not started", "In progress", "Completed"];
export const MENTOR = ["Unknown", "Awaiting assignment", "Assigned", "Meeting scheduled", "Met"];
export const BY_CODE = new Map(CATALOG.map(course => [course[0], course]));
const ORDER = CATALOG.map(course => course[0]);

export const emptyCourse = () => ({
  status: "not-started", examNotes: "", projectNotes: "", resources: "", blockers: "", nextAction: "", due: ""
});
function initialState() {
  return {
    schemaVersion: 2, order: [...ORDER], courses: {}, currentCourse: "", accelerationTerms: 4,
    enrollment: {
      startDate: "2026-12-01", startStatus: "Target date", orientation: "Unknown", orientationDate: "",
      orientationNotes: "", mentorStatus: "Unknown", mentor: "", mentorNotes: "", questions: "",
      finance: "", financeUnknown: ""
    },
    tasks: []
  };
}
const text = (value, length = 6000) => typeof value === "string" ? value.slice(0, length) : "";
export function dateValue(value) {
  if (typeof value !== "string" || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value ? value : "";
}
const pick = (value, choices, fallback) => choices.includes(value) ? value : fallback;
export function normalize(input) {
  const state = initialState();
  if (!input || typeof input !== "object") return state;
  if (Array.isArray(input.order)) {
    state.order = [...new Set([...input.order.filter(code => BY_CODE.has(code)), ...ORDER])];
  }
  for (const code of ORDER) {
    const saved = Object.hasOwn(input.courses ?? {}, code) ? input.courses[code] : null;
    if (!saved || typeof saved !== "object") continue;
    const entry = emptyCourse();
    entry.status = pick(saved.status, COURSE_STATUS, entry.status);
    entry.due = dateValue(saved.due);
    for (const key of COURSE_FIELDS) entry[key] = text(saved[key]);
    state.courses[code] = entry;
  }
  if (BY_CODE.has(input.currentCourse) && state.courses[input.currentCourse]?.status !== "complete") {
    state.currentCourse = input.currentCourse;
  }
  if (Number.isInteger(input.accelerationTerms)) {
    state.accelerationTerms = Math.min(10, Math.max(2, input.accelerationTerms));
  }
  const enrollment = input.enrollment;
  if (enrollment && typeof enrollment === "object") {
    const fields = state.enrollment;
    fields.startDate = dateValue(enrollment.startDate) || fields.startDate;
    fields.startStatus = pick(enrollment.startStatus, ["Target date", "Confirmed in myWGU", "Tentative"], fields.startStatus);
    fields.orientation = pick(enrollment.orientation, ORIENTATION, fields.orientation);
    fields.mentorStatus = pick(enrollment.mentorStatus, MENTOR, fields.mentorStatus);
    if (Object.hasOwn(enrollment, "orientationDate")) fields.orientationDate = dateValue(enrollment.orientationDate);
    for (const key of ["orientationNotes", "mentor", "mentorNotes", "questions", "finance", "financeUnknown"]) {
      if (Object.hasOwn(enrollment, key)) fields[key] = text(enrollment[key], key === "mentor" ? 180 : 6000);
    }
  }
  if (Array.isArray(input.tasks)) {
    const ids = new Set();
    state.tasks = [];
    for (const task of input.tasks.slice(0, 100)) {
      if (!task || typeof task !== "object") continue;
      const id = text(task.id, 80);
      const title = text(task.title, 200).trim();
      if (!/^[\w-]+$/.test(id) || !title || ids.has(id)) continue;
      ids.add(id);
      state.tasks.push({ id, title, note: text(task.note, 1500), due: dateValue(task.due), done: task.done === true });
    }
  }
  return state;
}

export const record = (state, code) => state.courses[code] || emptyCourse();
export function totals(state, courses = CATALOG) {
  const completed = courses.filter(([code]) => record(state, code).status === "complete");
  return { courses: completed.length, cu: sumCU(completed), max: sumCU(courses) };
}
export const sumCU = courses => courses.reduce((sum, course) => sum + course[2], 0);
export const sortedCourses = state => state.order.map(code => BY_CODE.get(code));
export const openCourses = state => sortedCourses(state).filter(([code]) => record(state, code).status !== "complete");
export function nextCourse(state) {
  const available = openCourses(state).filter(([code]) => code !== state.currentCourse && !record(state, code).blockers.trim());
  return available.find(([code]) => record(state, code).status === "in-progress") || available[0];
}
export function moveCourse(state, code, index) {
  const next = state.order.filter(value => value !== code);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, code);
  state.order = next;
}

const formatDate = new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"});
export const dateLabel = value => value ? formatDate.format(new Date(value + "T00:00:00Z")) : "";
function addMonths(value, offset) {
  const [year, month, day] = value.split("-").map(Number);
  const last = new Date(Date.UTC(year, month + offset, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + offset, Math.min(day, last)));
}
export function termDates(startDate, term) {
  const start = addMonths(startDate, (term - 1) * 6);
  const next = addMonths(startDate, term * 6);
  next.setUTCDate(next.getUTCDate() - 1);
  return [start.toISOString().slice(0, 10), next.toISOString().slice(0, 10)];
}
export function paceGroups(state) {
  const courses = sortedCourses(state);
  return Array.from({length: state.accelerationTerms}, (_, index) => courses.slice(
    Math.round(index * courses.length / state.accelerationTerms),
    Math.round((index + 1) * courses.length / state.accelerationTerms)
  ));
}

