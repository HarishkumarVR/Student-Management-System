import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { pool, runMigrations } from './db';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ejsMate = require('ejs-mate');

dotenv.config();

const PgSessionStore = pgSession(session);
const app = express();

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new PgSessionStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.userId) return res.redirect('/signin');
  next();
}

app.get('/', (req, res) => res.redirect('/signin'));

// Signup
app.get('/signup', (req, res) => {
  res.render('auth/signup', { error: null });
});

app.post('/signup', async (req, res) => {
  const { name, email, password, confirm_password } = req.body as Record<string, string>;
  if (!name || !email || !password || !confirm_password)
    return res.status(400).render('auth/signup', { error: 'All fields are required' });
  if (password !== confirm_password)
    return res.status(400).render('auth/signup', { error: 'Passwords do not match' });

  const emailNormalized = email.trim().toLowerCase();
  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [emailNormalized]);
  if (existing.rowCount && existing.rowCount > 0)
    return res.status(400).render('auth/signup', { error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [emailNormalized, passwordHash]);
  res.redirect('/signin');
});

// Signin
app.get('/signin', (req, res) => {
  res.render('auth/signin', { error: null });
});

app.post('/signin', async (req, res) => {
  const { email, password } = req.body as Record<string, string>;
  if (!email || !password)
    return res.status(400).render('auth/signin', { error: 'Email and password required' });
  const emailNormalized = email.trim().toLowerCase();
  const result = await pool.query('SELECT id, password_hash FROM users WHERE email=$1', [emailNormalized]);
  if (result.rowCount === 0)
    return res.status(400).render('auth/signin', { error: 'Invalid credentials' });
  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).render('auth/signin', { error: 'Invalid credentials' });
  req.session.userId = user.id;
  req.session.userEmail = emailNormalized;
  res.redirect('/dashboard');
});

app.post('/signout', (req, res) => {
  req.session.destroy(() => res.redirect('/signin'));
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard');
});

// Students
app.get('/students', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM students ORDER BY id ASC');
  res.render('students/index', { students: rows });
});

app.get('/students/new', requireAuth, (req, res) => {
  res.render('students/form', { student: null, error: null });
});

app.post('/students', requireAuth, async (req, res) => {
  const { name, email, reg_no, department } = req.body as Record<string, string>;
  if (!name || !email || !reg_no || !department)
    return res.status(400).render('students/form', { student: null, error: 'All fields required' });
  try {
    await pool.query(
      'INSERT INTO students (name, email, reg_no, department) VALUES ($1,$2,$3,$4)',
      [name.trim(), email.trim().toLowerCase(), reg_no.trim(), department.trim()]
    );
    res.redirect('/students');
  } catch (e) {
    res.status(400).render('students/form', { student: null, error: 'Registration number must be unique' });
  }
});

app.get('/students/:id/edit', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT * FROM students WHERE id=$1', [id]);
  if (rows.length === 0) return res.redirect('/students');
  res.render('students/form', { student: rows[0], error: null });
});

app.post('/students/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, email, reg_no, department } = req.body as Record<string, string>;
  if (!name || !email || !reg_no || !department)
    return res.status(400).render('students/form', { student: { id, name, email, reg_no, department }, error: null });
  try {
    await pool.query(
      'UPDATE students SET name=$1, email=$2, reg_no=$3, department=$4 WHERE id=$5',
      [name.trim(), email.trim().toLowerCase(), reg_no.trim(), department.trim(), id]
    );
    res.redirect('/students');
  } catch (e) {
    res.status(400).render('students/form', { student: { id, name, email, reg_no, department }, error: 'Registration number must be unique' });
  }
});

app.post('/students/:id/delete', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM students WHERE id=$1', [id]);
  res.redirect('/students');
});

// Marksheet
app.get('/marks', requireAuth, async (req, res) => {
  const { rows: students } = await pool.query('SELECT id, name, reg_no FROM students ORDER BY name');
  res.render('marks/index', { students, selected: null, error: null });
});

// Place summary BEFORE the parameterized route to avoid route conflicts
app.get('/marks/summary', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, s.reg_no, s.name,
             m.tamil, m.english, m.maths, m.science, m.social_science,
             m.total, m.grade, m.pass
      FROM marks m
      JOIN students s ON s.id = m.student_id
      ORDER BY m.id DESC
    `);
    console.log('Marks summary query result:', rows.length, 'entries');
    res.render('marks/summary', { entries: rows });
  } catch (error) {
    console.error('Error fetching marks summary:', error);
    res.status(500).render('marks/summary', { entries: [], error: 'Failed to load marks summary' });
  }
});

app.get('/marks/:studentId', requireAuth, async (req, res) => {
  const { studentId } = req.params;
  const numericId = parseInt(studentId, 10);
  if (Number.isNaN(numericId)) return res.redirect('/marks');
  const { rows: students } = await pool.query('SELECT id, name, reg_no FROM students ORDER BY name');
  const { rows } = await pool.query('SELECT id, name, reg_no FROM students WHERE id=$1', [numericId]);
  if (rows.length === 0) return res.redirect('/marks');
  res.render('marks/form', { students, student: rows[0], error: null });
});

app.post('/marks/:studentId', requireAuth, async (req, res) => {
  const { studentId } = req.params;
  const numericId = parseInt(studentId, 10);
  if (Number.isNaN(numericId)) return res.redirect('/marks');
  
  try {
    const getInt = (k: string) => Math.max(0, parseInt((req.body as any)[k] || '0', 10) || 0);
    const tamil = getInt('tamil');
    const english = getInt('english');
    const maths = getInt('maths');
    const science = getInt('science');
    const social_science = getInt('social_science');
    const total = tamil + english + maths + science + social_science;
    const pass = tamil>=35 && english>=35 && maths>=35 && science>=35 && social_science>=35;
    const grade = total >= 450 ? 'A+' : total >= 400 ? 'A' : total >= 350 ? 'B' : total >= 300 ? 'C' : 'D';
    
    console.log('Inserting marks:', { numericId, tamil, english, maths, science, social_science, total, grade, pass });
    
    await pool.query(
      'INSERT INTO marks (student_id, tamil, english, maths, science, social_science, total, grade, pass) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [numericId, tamil, english, maths, science, social_science, total, grade, pass]
    );
    
    console.log('Marks inserted successfully');
    res.redirect('/marks/summary');
  } catch (error) {
    console.error('Error inserting marks:', error);
    res.status(500).render('marks/form', { 
      students: [], 
      student: { id: numericId, name: 'Unknown', reg_no: 'Unknown' }, 
      error: 'Failed to save marks. Please try again.' 
    });
  }
});

// Attendance
app.get('/attendance', requireAuth, async (req, res) => {
  const { rows: students } = await pool.query('SELECT id, name FROM students ORDER BY name');
  res.render('attendance/index', { students, totals: null });
});

app.post('/attendance', requireAuth, async (req, res) => {
  const entries = Object.entries(req.body as Record<string, string>);
  for (const [key, value] of entries) {
    if (!key.startsWith('student_')) continue;
    const studentId = key.replace('student_', '');
    const status = value === 'present' ? 'present' : 'absent';
    await pool.query(
      `INSERT INTO attendance (student_id, status, marked_at)
       VALUES ($1,$2,CURRENT_DATE)
       ON CONFLICT (student_id, marked_at) DO UPDATE SET status = EXCLUDED.status`,
      [parseInt(studentId, 10), status]
    );
  }
  const { rows: students } = await pool.query('SELECT id, name FROM students ORDER BY name');
  const { rows: totalRow } = await pool.query('SELECT COUNT(*)::int as c FROM students');
  const { rows: presRow } = await pool.query("SELECT COUNT(*)::int as c FROM attendance WHERE marked_at=CURRENT_DATE AND status='present'");
  const { rows: absRow } = await pool.query("SELECT COUNT(*)::int as c FROM attendance WHERE marked_at=CURRENT_DATE AND status='absent'");
  res.render('attendance/index', {
    students,
    totals: { total: totalRow[0].c, present: presRow[0].c, absent: absRow[0].c },
  });
});

async function start() {
  await runMigrations();
  const port = parseInt(process.env.PORT || '3000', 10);
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
