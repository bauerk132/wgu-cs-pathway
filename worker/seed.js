const seedTask = (id, title, note) => ({ id, title, note, due: "", done: false });
function seededState() {
  return {
    schemaVersion: 2,
    order: CATALOG.map(([code]) => code), courses: {}, currentCourse: "", accelerationTerms: 4,
    enrollment: {
      startDate: "2026-12-01", startStatus: "Target date",
      orientation: "Completed", orientationDate: "2026-11-22",
      orientationNotes: "GDA1 shows Passed on the WGU Degree Plan. Completion confirmed Nov 23.",
      mentorStatus: "Assigned", mentor: "", mentorNotes: "Life HQ records an assignment. Verify the name and contact in myWGU.",
      questions: "Which courses will I register for in my first term? Which should I start with? What’s the process for adding courses if I finish early?",
      finance: "Backup payment plan set up Nov 20. Initial payment reported as $131 due Dec 15. OVR acknowledged receipt Nov 23 and planned to send the form for processing.",
      financeUnknown: "Check the portal for the posted balance and payment due. Pell disbursement and OVR authorization are still unverified."
    },
    tasks: [
      seedTask("personal-learning-guide", "Finish the Personal Learning Guide", "Complete the nine sections before the first mentor meeting. Completion status is unverified."),
      seedTask("mentor-meeting", "Verify mentor contact and book the first meeting", "Check the assignment in myWGU."),
      seedTask("term-one", "Confirm first-term courses and which to start", "Bring the class-selection questions to the mentor meeting."),
      seedTask("funding", "Verify tuition balance and payment deadline", "Check myWGU for Pell posting and the amount due while OVR is processing.")
    ]
  };
}
