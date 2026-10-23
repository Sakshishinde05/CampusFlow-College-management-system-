const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is missing from the .env file.");
  process.exit(1);
}

if (!process.env.JWT_SECRET || !process.env.ADMIN_SETUP_KEY) {
  console.error("JWT_SECRET and ADMIN_SETUP_KEY must be configured in .env.");
  process.exit(1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const studentSchema = new mongoose.Schema(
  {
    enrollmentNumber: { type: String, default: "", trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "" },
    course: { type: String, default: "" },
    status: { type: String, default: "Active" }
  },
  { timestamps: true }
);

const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    duration: { type: String, default: "" }
  },
  { timestamps: true }
);

const complaintSchema = new mongoose.Schema(
  {
    ticketId: { type: String, unique: true },
    studentName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    category: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved"],
      default: "Pending"
    },
    remarks: { type: String, default: "" }
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "faculty"],
      default: "admin"
    },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    date: { type: Date, required: true },
    subject: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Present", "Absent", "Late"],
      required: true
    }
  },
  { timestamps: true }
);

attendanceSchema.index(
  { studentId: 1, date: 1, subject: 1 },
  { unique: true }
);

const resultSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    subject: { type: String, required: true, trim: true },
    marks: { type: Number, required: true, min: 0 },
    maxMarks: { type: Number, required: true, min: 1 }
  },
  { timestamps: true }
);

resultSchema.pre("validate", function () {
  if (this.marks > this.maxMarks) {
    this.invalidate("marks", "Marks cannot exceed maximum marks.");
  }
});

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    audience: {
      type: String,
      enum: ["All", "Students", "Faculty"],
      default: "All"
    }
  },
  { timestamps: true }
);

const Student = mongoose.model("Student", studentSchema);
const Course = mongoose.model("Course", courseSchema);
const Complaint = mongoose.model("Complaint", complaintSchema);
const User = mongoose.model("User", userSchema);
const Attendance = mongoose.model("Attendance", attendanceSchema);
const Result = mongoose.model("Result", resultSchema);
const Notice = mongoose.model("Notice", noticeSchema);

function isLocalRequest(req) {
  const address = String(req.socket.remoteAddress || "");

  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function authenticate(req, res, next) {
  const allowBypass =
    process.env.ALLOW_DEV_BYPASS === "true" && isLocalRequest(req);

  if (allowBypass) {
    req.user = {
      id: "local-development",
      name: "Local Administrator",
      email: "local-admin@localhost",
      role: "admin"
    };

    return next();
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.userId,
      role: decoded.role
    };

    next();
  } catch {
    return res.status(401).json({
      message: "Your session has expired. Please log in again."
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access is required."
    });
  }

  next();
}

function pickFields(body, fields) {
  const result = {};

  for (const field of fields) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }

  return result;
}

// Authentication: create the first administrator

app.post("/api/auth/setup", async (req, res) => {
  try {
    const { setupKey, name, email, password } = req.body;

    if (
      !setupKey ||
      setupKey !== process.env.ADMIN_SETUP_KEY
    ) {
      return res.status(403).json({
        message: "Invalid administrator setup key."
      });
    }

    const existingAdmin = await User.exists({ role: "admin" });

    if (existingAdmin) {
      return res.status(409).json({
        message: "An administrator already exists."
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 12
    ) {
      return res.status(400).json({
        message:
          "Provide a name, valid email, and password of at least 12 characters."
      });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (existingUser) {
      return res.status(409).json({
        message: "This email is already registered."
      });
    }

    const admin = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: "admin"
    });

    res.status(201).json({
      message: "Administrator account created successfully.",
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "This email is already registered."
      });
    }

    res.status(500).json({ message: error.message });
  }
});

// Authentication: administrator login

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Enter your email and password."
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    }).select("+password");

    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Public complaint registration

app.post("/api/complaints", async (req, res) => {
  try {
    const ticketId =
      "CMP" +
      Date.now().toString().slice(-8) +
      Math.floor(100 + Math.random() * 900);

    const complaint = await Complaint.create({
      ...pickFields(req.body, [
        "studentName",
        "email",
        "category",
        "subject",
        "description"
      ]),
      ticketId
    });

    res.status(201).json({
      message: "Complaint registered successfully.",
      ticketId: complaint.ticketId,
      complaint
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Public complaint tracking

app.post("/api/complaints/track", async (req, res) => {
  try {
    const { ticketId, email } = req.body;

    const complaint = await Complaint.findOne({
      ticketId: String(ticketId || "").trim(),
      email: String(email || "").trim().toLowerCase()
    });

    if (!complaint) {
      return res.status(404).json({
        message:
          "No complaint found. Please check your ticket ID and email."
      });
    }

    res.json(complaint);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// All routes below require authentication.
// Local bypass works only when explicitly enabled in .env
// and the request originates from the local computer.

app.use("/api", authenticate);

// Current logged-in user

app.get("/api/auth/me", async (req, res) => {
  try {
    if (req.user.id === "local-development") {
      return res.json({
        user: {
          name: "Local Administrator",
          email: "local-admin@localhost",
          role: "admin"
        }
      });
    }

    const user = await User.findById(req.user.id);

    if (!user || !user.active) {
      return res.status(401).json({
        message: "User account not found or inactive."
      });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Dashboard statistics

app.get("/api/dashboard", async (req, res) => {
  try {
    const [
      students,
      courses,
      activeStudents,
      complaints,
      attendance,
      results,
      notices
    ] = await Promise.all([
      Student.countDocuments(),
      Course.countDocuments(),
      Student.countDocuments({ status: "Active" }),
      Complaint.countDocuments(),
      Attendance.countDocuments(),
      Result.countDocuments(),
      Notice.countDocuments()
    ]);

    res.json({
      students,
      courses,
      activeStudents,
      complaints,
      attendance,
      results,
      notices
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Student APIs

app.get("/api/students", async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/students", requireAdmin, async (req, res) => {
  try {
    const student = await Student.create(
      pickFields(req.body, [
        "enrollmentNumber",
        "name",
        "email",
        "phone",
        "course",
        "status"
      ])
    );

    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/students/:id", requireAdmin, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      pickFields(req.body, [
        "enrollmentNumber",
        "name",
        "email",
        "phone",
        "course",
        "status"
      ]),
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({
        message: "Student not found."
      });
    }

    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/students/:id", requireAdmin, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      return res.status(404).json({
        message: "Student not found."
      });
    }

    await Attendance.deleteMany({ studentId: student._id });
    await Result.deleteMany({ studentId: student._id });

    res.json({
      message: "Student deleted successfully."
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Course APIs

app.get("/api/courses", async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/courses", requireAdmin, async (req, res) => {
  try {
    const course = await Course.create(
      pickFields(req.body, ["name", "code", "duration"])
    );

    res.status(201).json(course);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/courses/:id", requireAdmin, async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({
        message: "Course not found."
      });
    }

    res.json({
      message: "Course deleted successfully."
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Attendance APIs

app.get("/api/attendance", async (req, res) => {
  try {
    const attendance = await Attendance.find()
      .populate("studentId", "name email enrollmentNumber")
      .sort({ date: -1 });

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/attendance", requireAdmin, async (req, res) => {
  try {
    const attendance = await Attendance.create(
      pickFields(req.body, [
        "studentId",
        "date",
        "subject",
        "status"
      ])
    );

    const populated = await attendance.populate(
      "studentId",
      "name email enrollmentNumber"
    );

    res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "Attendance for this student, date, and subject already exists."
      });
    }

    res.status(400).json({ message: error.message });
  }
});

// Results APIs

app.get("/api/results", async (req, res) => {
  try {
    const results = await Result.find()
      .populate("studentId", "name email enrollmentNumber")
      .sort({ createdAt: -1 });

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/results", requireAdmin, async (req, res) => {
  try {
    const result = await Result.create(
      pickFields(req.body, [
        "studentId",
        "subject",
        "marks",
        "maxMarks"
      ])
    );

    const populated = await result.populate(
      "studentId",
      "name email enrollmentNumber"
    );

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Notice APIs

app.get("/api/notices", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/notices", requireAdmin, async (req, res) => {
  try {
    const notice = await Notice.create(
      pickFields(req.body, ["title", "content", "audience"])
    );

    res.status(201).json(notice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/notices/:id", requireAdmin, async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);

    if (!notice) {
      return res.status(404).json({
        message: "Notice not found."
      });
    }

    res.json({
      message: "Notice deleted successfully."
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Complaint management APIs

app.get("/api/complaints", async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({
      createdAt: -1
    });

    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put("/api/complaints/:id", requireAdmin, async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      pickFields(req.body, ["status", "remarks"]),
      { new: true, runValidators: true }
    );

    if (!complaint) {
      return res.status(404).json({
        message: "Complaint not found."
      });
    }

    res.json({
      message: "Complaint updated successfully.",
      complaint
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Frontend fallback

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server after MongoDB connects

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully.");

    app.listen(PORT, () => {
      console.log(
        `College Management System running at http://localhost:${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });