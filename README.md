# College Management System

A simple college management web application built with HTML, CSS, JavaScript, Node.js, Express and MongoDB.

## Features
- Dashboard with student and course totals
- Add, view, search, edit and delete student records
- Add, view, edit and delete course records
- MongoDB database connection using Mongoose
- Responsive interface for desktop and mobile
- Basic validation and duplicate roll-number/course-code handling

## Requirements
- Node.js and npm
- MongoDB installed and running locally, or a MongoDB Atlas connection string

## Run locally
1. Open this project folder in a terminal.
2. Install packages:
   ```bash
   npm install
   ```
3. Create a `.env` file by copying `.env.example`.
4. If needed, update `MONGODB_URI` in `.env`.
5. Start the application:
   ```bash
   npm start
   ```
6. Open `http://localhost:5000` in your browser.

## Project structure
```text
college-management-system/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── index.html
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Database
The application uses a MongoDB database named `collegeManagementDB` by default. It creates `students` and `courses` collections when records are added.

## Note
This is a college project starter. Before using it for real college data, add authentication, role-based permissions, stronger validation, and production security settings. Do not upload your real `.env` file or database credentials to GitHub.
