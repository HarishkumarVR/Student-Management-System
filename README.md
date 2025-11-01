 Student Management System

A full-stack **Student Management System** built with **Node.js**, **Express.js**, **PostgreSQL** (via PgAdmin), and **TypeScript**, featuring secure user authentication, dynamic student management, attendance tracking, and marksheet generation.

---

 Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Folder Structure](#folder-structure)
- [Contributing](#contributing)
- [License](#license)

---

 Features
- User Authentication: Secure login and signup using bcrypt for password hashing.  
- Dynamic Student Management: Add, edit, and manage student records.  
- Attendance Tracking: Maintain attendance records for registered students.  
- Marksheet Generation: Generate marksheets for registered students.  
- Database Integration: All data stored securely in PostgreSQL.  

---

 Tech Stack
- Frontend: HTML, CSS, JavaScript, EJS  
- Backend: Node.js, Express.js, TypeScript  
- Database: PostgreSQL (PgAdmin)  
- Authentication: bcrypt

  Install dependencies
  -npm install

Create a .env file in the root directory and add your environment variables

DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
PORT=3000

Start the server:

npm run dev
