
const $ = (selector) => document.querySelector(selector);

let token = localStorage.getItem("collegeToken") || "";
let currentUser = null;
let studentsCache = [];

const pageInfo = {
    dashboard: ["Dashboard", "Here's what's happening at your college."],
    students: ["Students", "Register and manage student records."],
    courses: ["Courses", "Manage your college courses."],
    attendance: ["Attendance", "Record and review attendance."],
    results: ["Marks & Results", "Manage examination records."],
    notices: ["Notice Board", "Publish important announcements."],
    complaints: ["Complaints", "Manage student complaints."]
};

function message(text, type = "info") {
    const element = $("#globalMessage");

    if (!element) return;

    element.textContent = text;
    element.classList.remove("hidden");

    element.style.background =
        type === "error" ? "#fff0f0" : "#eeecff";

    element.style.color =
        type === "error" ? "#c53f52" : "#5046c4";

    clearTimeout(message.timer);

    message.timer = setTimeout(() => {
        element.classList.add("hidden");
    }, 4000);
}

async function api(url, options = {}) {
    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token && url !== "/api/auth/login"
            ? { Authorization: `Bearer ${token}` }
            : {}),
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (
            response.status === 401 &&
            url !== "/api/auth/login"
        ) {
            logout(false);
        }

        throw new Error(data.message || "Request failed.");
    }

    return data;
}

function escapeText(value) {
    return String(value ?? "");
}

function setText(selector, value) {
    const element = $(selector);

    if (element) {
        element.textContent = value ?? "";
    }
}

function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
}

function showLogin() {
    $("#loginScreen")?.classList.remove("hidden");
}

function hideLogin() {
    $("#loginScreen")?.classList.add("hidden");
}

function logout(showMessage = true) {
    token = "";
    currentUser = null;

    localStorage.removeItem("collegeToken");

    showLogin();

    if (showMessage) {
        setText("#loginMessage", "Please sign in again.");
    }
}

async function login(event) {
    event.preventDefault();

    const form = $("#loginForm");
    const result = $("#loginMessage");
    const button = form?.querySelector('button[type="submit"]');

    if (!form || !result) {
        console.error("Login form or login message element was not found.");
        return;
    }

    result.textContent = "";

    const email = $("#loginEmail")?.value.trim();
    const password = $("#loginPassword")?.value;

    if (!email || !password) {
        result.textContent = "Please enter your email and password.";
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Signing in...";
    }

    result.textContent = "Signing in...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || "Login failed.");
        }

        if (!data.token) {
            throw new Error("The server did not return an authentication token.");
        }

        token = data.token;

        localStorage.setItem("collegeToken", token);

        currentUser = data.user || null;

        const started = await startApp();

        if (!started) {
            throw new Error(
                result.textContent ||
                "Login verification failed. Please try again."
            );
        }

        result.textContent = "";

    } catch (error) {
        console.error("Login error:", error);

        result.textContent =
            error.message || "Unable to sign in. Please try again.";

        showLogin();

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Sign In";
        }
    }
}

function showSection(id) {
    if (!pageInfo[id]) return;

    document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("hidden", section.id !== id);
    });

    document.querySelectorAll(".nav-item").forEach((button) => {
        button.classList.toggle(
            "active",
            button.dataset.section === id
        );
    });

    setText("#pageTitle", pageInfo[id][0]);
    setText("#pageSubtitle", pageInfo[id][1]);

    $("#sidebar")?.classList.remove("open");
}

async function openSection(id) {
    if (!token) {
        showLogin();
        return;
    }

    showSection(id);

    try {
        await loadSection(id);
    } catch (error) {
        message(error.message, "error");
    }
}

async function loadSection(id) {
    const loaders = {
        dashboard: loadDashboard,
        students: loadStudents,
        courses: loadCourses,
        attendance: loadAttendance,
        results: loadResults,
        notices: loadNotices,
        complaints: loadComplaints
    };

    if (loaders[id]) {
        await loaders[id]();
    }
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function createItem(titleText, details = []) {
    const item = makeElement("article", "item");

    item.append(makeElement("h3", "", titleText));

    details.forEach((detail) => {
        item.append(makeElement("p", "", detail));
    });

    return item;
}

function setEmpty(list, text) {
    if (!list) return;

    list.replaceChildren(
        makeElement("p", "empty-state", text)
    );
}

async function loadDashboard() {
    const data = await api("/api/dashboard");

    setText("#totalStudents", data.students ?? 0);
    setText("#totalCourses", data.courses ?? 0);
    setText("#activeStudents", data.activeStudents ?? 0);
    setText("#totalComplaints", data.complaints ?? 0);

    try {
        const notices = await api("/api/notices");
        const list = $("#dashboardNotices");

        if (!list) return;

        list.replaceChildren();

        const latest = (
            Array.isArray(notices) ? notices : []
        ).slice(0, 4);

        if (!latest.length) {
            setEmpty(list, "No notices have been published yet.");
            return;
        }

        latest.forEach((notice) => {
            const card = makeElement("div", "notice-card");

            card.append(
                makeElement("h4", "", notice.title || "College Notice"),
                makeElement(
                    "p",
                    "",
                    notice.content || notice.description || ""
                )
            );

            list.append(card);
        });

    } catch (error) {
        console.error("Unable to load dashboard notices:", error);

        setEmpty(
            $("#dashboardNotices"),
            "Notices are currently unavailable."
        );
    }
}

async function loadStudents() {
    const response = await api("/api/students");

    studentsCache = Array.isArray(response) ? response : [];

    const search = ($("#studentSearch")?.value || "")
        .trim()
        .toLowerCase();

    const list = $("#studentsList");

    if (!list) return;

    list.replaceChildren();

    const filtered = studentsCache.filter((student) => {
        const content = [
            student.name,
            student.email,
            student.phone,
            student.course,
            student.enrollmentNumber
        ].join(" ").toLowerCase();

        return content.includes(search);
    });

    if (!filtered.length) {
        setEmpty(
            list,
            "No students found. Add a student to get started."
        );

        populateStudentOptions();
        return;
    }

    filtered.forEach((student) => {
        const item = createItem(student.name, [
            `Email: ${student.email}`,
            `Phone: ${student.phone || "-"}`,
            `Enrollment: ${student.enrollmentNumber || "-"}`,
            `Course: ${student.course || "-"}`,
            `Status: ${student.status || "Active"}`
        ]);

        const remove = makeElement("button", "", "Delete Student");

        remove.addEventListener("click", async () => {
            if (!confirm(`Delete ${student.name}?`)) return;

            try {
                await api(`/api/students/${student._id}`, {
                    method: "DELETE"
                });

                message("Student deleted successfully.");

                await loadStudents();
                await loadDashboard();

            } catch (error) {
                message(error.message, "error");
            }
        });

        item.append(remove);
        list.append(item);
    });

    populateStudentOptions();
}

async function addStudent(event) {
    event.preventDefault();

    try {
        await api("/api/students", {
            method: "POST",
            body: JSON.stringify(formData(event.currentTarget))
        });

        event.currentTarget.reset();

        message("Student added successfully.");

        await loadStudents();
        await loadDashboard();

    } catch (error) {
        message(error.message, "error");
    }
}

async function loadCourses() {
    const response = await api("/api/courses");

    const courses = Array.isArray(response) ? response : [];

    const list = $("#coursesList");

    if (!list) return;

    list.replaceChildren();

    if (!courses.length) {
        setEmpty(list, "No courses available. Add your first course.");
        return;
    }

    courses.forEach((course) => {
        const item = createItem(course.name, [
            `Course code: ${course.code}`,
            `Duration: ${course.duration || "-"}`
        ]);

        const remove = makeElement("button", "", "Delete Course");

        remove.addEventListener("click", async () => {
            if (!confirm(`Delete course ${course.name}?`)) return;

            try {
                await api(`/api/courses/${course._id}`, {
                    method: "DELETE"
                });

                message("Course deleted successfully.");

                await loadCourses();
                await loadDashboard();

            } catch (error) {
                message(error.message, "error");
            }
        });

        item.append(remove);
        list.append(item);
    });
}

async function addCourse(event) {
    event.preventDefault();

    try {
        await api("/api/courses", {
            method: "POST",
            body: JSON.stringify(formData(event.currentTarget))
        });

        event.currentTarget.reset();

        message("Course added successfully.");

        await loadCourses();
        await loadDashboard();

    } catch (error) {
        message(error.message, "error");
    }
}

function populateStudentOptions() {
    [
        $("#attendanceStudent"),
        $("#resultStudent")
    ].forEach((select) => {
        if (!select) return;

        const previousValue = select.value;

        select.replaceChildren();

        select.append(new Option("Select student", ""));

        studentsCache.forEach((student) => {
            select.append(
                new Option(
                    `${student.name} (${student.email})`,
                    student._id
                )
            );
        });

        if (
            [...select.options].some(
                (option) => option.value === previousValue
            )
        ) {
            select.value = previousValue;
        }
    });
}

async function loadAttendance() {
    await loadStudents();

    const response = await api("/api/attendance");
    const records = Array.isArray(response) ? response : [];
    const list = $("#attendanceList");

    if (!list) return;

    list.replaceChildren();

    if (!records.length) {
        setEmpty(list, "No attendance records have been added.");
        return;
    }

    records.forEach((record) => {
        const student = record.studentId;

        const studentName =
            typeof student === "object" && student !== null
                ? student.name
                : studentsCache.find(
                    (item) => item._id === student
                )?.name;

        list.append(
            createItem(
                studentName || record.studentName || "Student",
                [
                    `Date: ${
                        record.date
                            ? String(record.date).slice(0, 10)
                            : "-"
                    }`,
                    `Status: ${record.status || "-"}`,
                    `Subject: ${record.subject || "-"}`
                ]
            )
        );
    });
}

async function addAttendance(event) {
    event.preventDefault();

    const values = formData(event.currentTarget);

    try {
        await api("/api/attendance", {
            method: "POST",
            body: JSON.stringify(values)
        });

        event.currentTarget.reset();

        setDefaultDates();

        message("Attendance recorded successfully.");

        await loadAttendance();

    } catch (error) {
        message(error.message, "error");
    }
}

async function loadResults() {
    await loadStudents();

    const response = await api("/api/results");
    const results = Array.isArray(response) ? response : [];
    const list = $("#resultsList");

    if (!list) return;

    list.replaceChildren();

    if (!results.length) {
        setEmpty(list, "No examination results have been added.");
        return;
    }

    results.forEach((result) => {
        const student = result.studentId;

        const studentName =
            typeof student === "object" && student !== null
                ? student.name
                : studentsCache.find(
                    (item) => item._id === student
                )?.name;

        const marks = Number(result.marks);
        const maximum = Number(result.maxMarks);

        const percentage =
            maximum > 0
                ? `${((marks / maximum) * 100).toFixed(1)}%`
                : "-";

        list.append(
            createItem(
                studentName || result.studentName || "Student",
                [
                    `Subject: ${result.subject || "-"}`,
                    `Marks: ${result.marks ?? "-"} / ${result.maxMarks ?? "-"}`,
                    `Percentage: ${percentage}`
                ]
            )
        );
    });
}

async function addResult(event) {
    event.preventDefault();

    const values = formData(event.currentTarget);

    if (
        values.marks === "" ||
        values.maxMarks === "" ||
        Number(values.marks) < 0 ||
        Number(values.maxMarks) <= 0
    ) {
        message("Enter valid marks and maximum marks.", "error");
        return;
    }

    if (Number(values.marks) > Number(values.maxMarks)) {
        message(
            "Marks obtained cannot exceed maximum marks.",
            "error"
        );

        return;
    }

    try {
        await api("/api/results", {
            method: "POST",
            body: JSON.stringify(values)
        });

        event.currentTarget.reset();

        const maximum = $("#resultForm [name=maxMarks]");

        if (maximum) {
            maximum.value = 100;
        }

        message("Examination result saved successfully.");

        await loadResults();

    } catch (error) {
        message(error.message, "error");
    }
}

async function loadNotices() {
    const response = await api("/api/notices");
    const notices = Array.isArray(response) ? response : [];
    const list = $("#noticesList");

    if (!list) return;

    list.replaceChildren();

    if (!notices.length) {
        setEmpty(list, "No notices published yet.");
        return;
    }

    notices.forEach((notice) => {
        const item = createItem(
            notice.title || "College Notice",
            [
                notice.content || notice.description || "",
                `Audience: ${notice.audience || "All"}`,
                `Published: ${
                    notice.createdAt
                        ? new Date(notice.createdAt).toLocaleDateString()
                        : "-"
                }`
            ]
        );

        const remove = makeElement("button", "", "Delete Notice");

        remove.addEventListener("click", async () => {
            if (!confirm("Delete this notice?")) return;

            try {
                await api(`/api/notices/${notice._id}`, {
                    method: "DELETE"
                });

                message("Notice deleted successfully.");

                await loadNotices();
                await loadDashboard();

            } catch (error) {
                message(error.message, "error");
            }
        });

        item.append(remove);
        list.append(item);
    });
}

async function addNotice(event) {
    event.preventDefault();

    try {
        await api("/api/notices", {
            method: "POST",
            body: JSON.stringify(formData(event.currentTarget))
        });

        event.currentTarget.reset();

        message("Notice published successfully.");

        await loadNotices();
        await loadDashboard();

    } catch (error) {
        message(error.message, "error");
    }
}

async function loadComplaints() {
    const response = await api("/api/complaints");
    const complaints = Array.isArray(response) ? response : [];
    const list = $("#complaintsList");

    if (!list) return;

    list.replaceChildren();

    if (!complaints.length) {
        setEmpty(list, "No complaints have been registered.");
        return;
    }

    complaints.forEach((complaint) => {
        const item = createItem(
            complaint.subject || "Complaint",
            [
                `Ticket ID: ${complaint.ticketId || "-"}`,
                `Student: ${complaint.studentName || "-"}`,
                `Email: ${complaint.email || "-"}`,
                `Category: ${complaint.category || "-"}`,
                `Priority: ${complaint.priority || "Medium"}`,
                `Description: ${complaint.description || ""}`
            ]
        );

        const status = makeElement(
            "p",
            "status",
            `Current status: ${complaint.status || "Pending"}`
        );

        const statusSelect = document.createElement("select");

        ["Pending", "In Progress", "Resolved"].forEach((value) => {
            statusSelect.append(new Option(value, value));
        });

        statusSelect.value = complaint.status || "Pending";

        const remarks = document.createElement("textarea");

        remarks.placeholder = "Add admin remarks";
        remarks.value = complaint.remarks || "";

        const save = makeElement("button", "", "Update Complaint");

        save.addEventListener("click", async () => {
            try {
                await api(`/api/complaints/${complaint._id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        status: statusSelect.value,
                        remarks: remarks.value
                    })
                });

                message("Complaint updated successfully.");

                await loadComplaints();
                await loadDashboard();

            } catch (error) {
                message(error.message, "error");
            }
        });

        item.append(status, statusSelect, remarks, save);

        list.append(item);
    });
}

async function addComplaint(event) {
    event.preventDefault();

    try {
        const response = await api("/api/complaints", {
            method: "POST",
            body: JSON.stringify(formData(event.currentTarget))
        });

        const result = $("#registrationResult");

        if (result) {
            result.textContent =
                `${response.message || "Complaint submitted successfully."} ` +
                `Ticket ID: ${response.ticketId || "Check server response"}.`;
        }

        event.currentTarget.reset();

        if (token) {
            await loadDashboard();
        }

    } catch (error) {
        const result = $("#registrationResult");

        if (result) {
            result.textContent = error.message;
        }
    }
}

async function trackComplaint(event) {
    event.preventDefault();

    try {
        const response = await api("/api/complaints/track", {
            method: "POST",
            body: JSON.stringify(formData(event.currentTarget))
        });

        const output = $("#trackingResult");

        if (!output) return;

        output.replaceChildren();

        [
            `Ticket ID: ${response.ticketId || "-"}`,
            `Subject: ${response.subject || "-"}`,
            `Category: ${response.category || "-"}`,
            `Status: ${response.status || "-"}`,
            `Remarks: ${response.remarks || "No remarks yet."}`
        ].forEach((value) => {
            output.append(makeElement("p", "", value));
        });

    } catch (error) {
        const output = $("#trackingResult");

        if (output) {
            output.textContent = error.message;
        }
    }
}

async function exportStudents() {
    try {
        const students = await api("/api/students");

        const rows = [
            [
                "Name",
                "Email",
                "Phone",
                "Enrollment Number",
                "Course",
                "Status"
            ],
            ...students.map((student) => [
                student.name,
                student.email,
                student.phone || "",
                student.enrollmentNumber || "",
                student.course || "",
                student.status || ""
            ])
        ];

        const csv = rows.map((row) =>
            row.map((value) => {
                let text = String(value ?? "");

                if (/^[=+\-@\t\r]/.test(text)) {
                    text = "'" + text;
                }

                return `"${text.replace(/"/g, '""')}"`;
            }).join(",")
        ).join("\r\n");

        const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "college-students.csv";

        document.body.append(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        message("Student records exported successfully.");

    } catch (error) {
        message(error.message, "error");
    }
}

function setDefaultDates() {
    const today = new Date();

    const localDate = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

    if ($("#attendanceDate")) {
        $("#attendanceDate").value = localDate;
    }

    setText(
        "#currentDate",
        today.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        })
    );
}

function bindEvents() {
    $("#loginForm")?.addEventListener("submit", login);

    $("#logoutButton")?.addEventListener("click", () => {
        logout();
    });

    $("#menuButton")?.addEventListener("click", () => {
        $("#sidebar")?.classList.toggle("open");
    });

    document.querySelectorAll("[data-section]").forEach((button) => {
        button.addEventListener("click", () => {
            openSection(button.dataset.section);
        });
    });

    document.querySelectorAll("[data-open]").forEach((button) => {
        button.addEventListener("click", () => {
            openSection(button.dataset.open);
        });
    });

    $("#studentForm")?.addEventListener("submit", addStudent);
    $("#courseForm")?.addEventListener("submit", addCourse);
    $("#attendanceForm")?.addEventListener("submit", addAttendance);
    $("#resultForm")?.addEventListener("submit", addResult);
    $("#noticeForm")?.addEventListener("submit", addNotice);
    $("#complaintForm")?.addEventListener("submit", addComplaint);
    $("#trackForm")?.addEventListener("submit", trackComplaint);

    $("#studentSearch")?.addEventListener("input", () => {
        loadStudents().catch((error) => {
            message(error.message, "error");
        });
    });

    $("#exportStudents")?.addEventListener("click", exportStudents);

    $("#refreshDashboard")?.addEventListener("click", async () => {
        try {
            await loadDashboard();
            message("Dashboard refreshed.");
        } catch (error) {
            message(error.message, "error");
        }
    });
}

async function startApp() {
    if (!token) {
        showLogin();
        return false;
    }

    try {
        const response = await api("/api/auth/me");

        currentUser = response.user || response;

        const name = currentUser.name || "Administrator";

        setText("#adminName", name);
        setText("#adminRole", currentUser.role || "College Admin");
        setText(".profile-avatar", name.charAt(0).toUpperCase());
        setText(".top-avatar", name.charAt(0).toUpperCase());

        hideLogin();
        showSection("dashboard");

    } catch (error) {
        console.error("Authentication verification failed:", error);

        token = "";
        currentUser = null;

        localStorage.removeItem("collegeToken");

        showLogin();

        setText(
            "#loginMessage",
            "Unable to verify your login. Please sign in again."
        );

        return false;
    }

    try {
        await loadDashboard();
    } catch (error) {
        console.error("Dashboard loading failed:", error);

        message(
            "You are logged in, but the dashboard could not load: " +
            error.message,
            "error"
        );
    }

    return true;
}

bindEvents();

setDefaultDates();

startApp().catch((error) => {
    console.error("Application startup failed:", error);
});

