# CampusFlow – College Management System

CampusFlow is a web-based college management system designed to manage college activities through a simple and user-friendly interface.

### Features

* Secure Admin Login and Authentication
* Dashboard with College Statistics
* Student Management
* Course Management
* Attendance Management
* Student Results Management
* Notice Management
* Student Complaint Management and Tracking

### Technologies Used

* **Frontend:** HTML, CSS, JavaScript
* **Backend:** Node.js, Express.js
* **Database:** MongoDB
* **Authentication:** JSON Web Tokens (JWT), bcryptjs

### Installation and Setup

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm install
   ```
3. Create a `.env` file and configure the following variables:

   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/collegeManagementDB
   JWT_SECRET=your_secure_jwt_secret
   ADMIN_SETUP_KEY=your_secure_setup_key
   ALLOW_DEV_BYPASS=false
   ```
4. Start MongoDB.
5. Start the application:

   ```bash
   npm start
   ```
6. Open `http://localhost:5000` in your browser.

### Note

Keep your `.env` file and secret keys private. Never upload passwords, tokens, or other sensitive credentials to GitHub.
